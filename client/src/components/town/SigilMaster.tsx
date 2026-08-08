import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { SLOT_NAMES, SLOT_ORDER, type EquipmentInstance, type EquipSlot } from '../../models/equipment';
import {
  AFFIX_DEFINITIONS,
  DEFAULT_MAX_AFFIX_TIER,
  getAffixCategoryForSlot,
  getSpecialAffixDefinition,
  getWeaponBaseDamage,
  isSpecialAffixType,
  isMaxRollAffix,
  type Affix,
} from '../../models/affix';
import {
  POLISH_SIGIL_GOLD_COST,
  POLISH_SIGIL_QUALITY_MAX,
  SIGIL_DEFINITIONS,
  SIGIL_PANEL_ORDER,
  DEFAULT_PANEL_SIGIL,
  applyChaosSigil,
  applyEnhanceSigil,
  applyPolishSigil,
  applyRecarveSigil,
  applyStingSigil,
  applyTemperSigil,
  canUseSigil,
  getEnhanceSigilRate,
  getSigilDefinition,
  getUpgradeSigilFor,
  type SigilContext,
  type SigilResult,
  type SigilType,
} from '../../models/sigil';
import { db } from '../../db/database';
import { getBagItemAmount, consumeBagItem } from '../../models/bagItem';
import { getItemById } from '../../models/items';
import { resolveItemIcon, getEquipIcon } from '../../models/iconMap';
import { getEquipmentInstanceTierColor } from '../../models/equipmentTier';
import { GameIcon } from '../GameIcon';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';
import { useOneShotFx, FX_DURATION_MS } from './useOneShotFx';

type Entry = { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot };

/**
 * 印記演出的總長度（`48-vfx.md` § 48.5）。
 * 最長的一段是突破的浮字：stagger 0.32s + 1.1s。
 */
export const SIGIL_FX_DURATION_MS = FX_DURATION_MS;

/** 詞綴 Tier 色階（`34-ui-guidelines.md` § 34.2）。突破的爆閃走新 Tier 的顏色 */
const TIER_COLOR: Record<number, string> = {
  1: '#6B7280', 2: '#9CA3AF', 3: '#4ADE80', 4: '#FACC15', 5: '#FB923C', 6: '#EF4444', 7: '#A855F7',
};

/** 必定生效的印記各自的掃光色（§ 48.5）。突破不在此列，它走 Tier 色 */
const SWEEP_COLOR: Partial<Record<SigilType, string>> = {
  temper: 'var(--accent-info)',
  recarve: 'var(--accent-info)',
  sting: 'var(--accent-primary)',
  chaos: 'var(--accent-primary)',
  polish: 'var(--accent-gold)',
};

type SigilFxMode = 'sweep' | 'chaos' | 'polish' | 'break-ok' | 'break-fail';

interface SigilFx {
  mode: SigilFxMode;
  /** 演在哪一條詞綴。`polish`／`chaos` 不指定單條 */
  affixIndex?: number;
  color?: string;
  /** 突破的浮字：成功 `T6`、失敗 `T1` */
  label?: string;
}

function affixLabel(affix: Affix): string {
  if (isSpecialAffixType(affix.type)) {
    return `[特殊] ${getSpecialAffixDefinition(affix.type)?.name ?? affix.type}`;
  }
  const def = AFFIX_DEFINITIONS.find(d => d.type === affix.type);
  return `${def?.name ?? affix.type} T${affix.tier}`;
}

/**
 * 印記的顯示名稱與顏色一律由 `itemId` 反查 seed（§ 99.1：設定表存 id，名稱只用於顯示）。
 * 介面不另建 label 表與色表 —— 道具改名或改色時這裡自動跟上，
 * 玩家在背包看到的是哪個顏色的圖示，到印記師就是同一個顏色。
 */
function sigilDisplay(type: SigilType): { name: string; color?: string } {
  const def = getSigilDefinition(type);
  const item = getItemById(def.itemId);
  return { name: item?.name ?? def.name, color: resolveItemIcon(item, 'scroll').color };
}

export function SigilMaster() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const allTemplates = useEquipmentTemplates();

  /** 選裝備 → 選詞綴 → 選印記 → 右下角一顆按鈕執行（`13-town.md` § 13.13） */
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [affixIndex, setAffixIndex] = useState<number | null>(null);
  const [sigilType, setSigilType] = useState<SigilType>(DEFAULT_PANEL_SIGIL);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const { fx, play: playFx } = useOneShotFx<SigilFx>();

  if (!char) return null;

  const sigilCounts = Object.fromEntries(
    SIGIL_DEFINITIONS.map(d => [d.type, getBagItemAmount(bagItems, d.itemId)]),
  ) as Record<SigilType, number>;

  // 身上與背包是同一份清單，只是分兩組顯示 —— 印記兩邊都能用（§ 46.9）
  const equippedEntries: Entry[] = SLOT_ORDER
    .map(slot => ({ slot, item: equippedGear[slot] }))
    .filter((e): e is { slot: EquipSlot; item: EquipmentInstance } => e.item != null)
    .map(e => ({ item: e.item, source: 'equipped' as const, slot: e.slot }));
  const bagEntries: Entry[] = inventory.map(item => ({ item, source: 'bag' as const }));
  const allEntries = [...equippedEntries, ...bagEntries];

  // 選中的裝備可能被別處換掉（換裝、賣掉），失效就退回第一件
  const entry = allEntries.find(e => e.item.id === selectedItemId) ?? allEntries[0];
  const item = entry?.item;

  const def = getSigilDefinition(sigilType);
  const display = sigilDisplay(sigilType);
  const affixes = item?.affixes ?? [];

  /** 新手裝名單只有 seed 一個來源（`99-ai-constraints.md` 第 4 條） */
  function isStarterGear(it: EquipmentInstance): boolean {
    return allTemplates.find(t => t.id === it.templateId)?.acquireType === 'starter';
  }

  /** 這件裝備所有印記都不受理，清單上直接標出來，不必點進去才知道 */
  function inertReason(it: EquipmentInstance): string | null {
    if (isStarterGear(it)) return '新手裝';
    if ((it.affixes?.length ?? 0) === 0) return '無詞綴';
    return null;
  }

  function buildContext(it: EquipmentInstance): SigilContext {
    return {
      category: getAffixCategoryForSlot(it.slot, it.type),
      charLevel: char!.level,
      maxAffixTier: it.maxAffixTier,
      quality: it.quality ?? 0,
      weaponBaseDamage: getWeaponBaseDamage(it),
      isStarterGear: isStarterGear(it),
    };
  }

  /** 這一條詞綴能不能被目前選到的印記受理。判定只有 `canUseSigil()` 一個來源 */
  function checkAffix(idx: number) {
    if (!item) return { ok: false as const, reason: '沒有裝備' };
    return canUseSigil(sigilType, affixes, idx, {
      isStarterGear: isStarterGear(item),
      maxAffixTier: item.maxAffixTier,
      quality: item.quality ?? 0,
    });
  }

  /** 背包列一律以 `itemTemplateId` 定位（§ 99.1），不可用 name 查 —— 改名即失聯 */
  function persistBagItem(itemId: number, newAmount: number) {
    if (!char?.id) return;
    const rows = db.characterBag.where({ characterId: char.id, itemTemplateId: itemId });
    if (newAmount <= 0) {
      rows.delete();
    } else {
      rows.modify({ amount: newAmount });
    }
  }

  /** 扣掉一個印記並寫回裝備 */
  function commit(message: string, patch: Partial<EquipmentInstance>, goldCost = 0) {
    if (!entry || !item) return;
    const updatedItem = { ...item, ...patch };
    if (item.id) {
      db.equipmentInstances.update(item.id, patch);
    }

    const newBag = consumeBagItem(useGameStore.getState().bagItems, def.itemId);
    persistBagItem(def.itemId, sigilCounts[sigilType] - 1);

    const updatedChar = goldCost > 0 ? { ...char!, gold: char!.gold - goldCost } : char!;
    if (goldCost > 0 && char!.id) db.characters.update(char!.id, { gold: updatedChar.gold });

    if (entry.source === 'equipped' && entry.slot) {
      useGameStore.setState({
        character: updatedChar,
        equippedGear: { ...equippedGear, [entry.slot]: updatedItem },
        bagItems: newBag,
      });
    } else {
      useGameStore.setState({
        character: updatedChar,
        inventory: inventory.map(i => (i.id === item.id ? updatedItem : i)),
        bagItems: newBag,
      });
    }

    setResultMsg(`${item.name}｜${message}`);
    useGameStore.getState().saveState();
  }

  /**
   * 突破印記的確認訊息（§ 46.7）：成功率與失敗代價都寫在裡面，
   * 成功率一律由 `getUpgradeSigilFor()` 取得，不在 UI 另寫一份數字。
   */
  function confirmBreakthrough(idx: number): boolean {
    const affix = affixes[idx];
    const rate = getUpgradeSigilFor(affix, item!.maxAffixTier)?.rate ?? 0;
    return window.confirm(
      `確定要對「${item!.name}」的 ${affixLabel(affix)} 使用突破印記嗎？\n\n`
      + `成功率 ${Math.round(rate * 100)}%（T${affix.tier} → T${affix.tier + 1}）\n`
      + `失敗時該詞綴會掉回 T1 並重骰數值，印記照樣消耗。`,
    );
  }

  /* 演出只掛在畫面上，不參與判定（`48-vfx.md` § 48.1） */

  function handleApply() {
    if (!item) return;
    const ctx = buildContext(item);

    // § 46.8 工藝印記：對象是整件裝備，且是唯一要收金幣的印記
    if (sigilType === 'polish') {
      const check = canUseSigil('polish', item.affixes, undefined, ctx);
      if (!check.ok) return setResultMsg(check.reason ?? '無法使用');
      if (char!.gold < POLISH_SIGIL_GOLD_COST) return setResultMsg('金幣不足');
      const polished = applyPolishSigil(item.quality ?? 0);
      if (!polished.success) return setResultMsg(polished.message);
      commit(polished.message, { quality: polished.quality }, POLISH_SIGIL_GOLD_COST);
      playFx({ mode: 'polish', color: SWEEP_COLOR.polish });
      return;
    }

    const check = canUseSigil(sigilType, item.affixes, affixIndex ?? undefined, ctx);
    if (!check.ok) return setResultMsg(check.reason ?? '無法使用');
    if (sigilCounts[sigilType] <= 0) return;

    // 突破印記失敗會把詞綴砍回 T1（§ 46.7），代價不可逆，動手前先問一次
    if (sigilType === 'enhance' && !confirmBreakthrough(affixIndex!)) return;

    let result: SigilResult;
    if (sigilType === 'chaos') {
      result = applyChaosSigil(ctx);
    } else if (sigilType === 'sting') {
      result = applyStingSigil(item.affixes!, affixIndex!, ctx);
    } else if (sigilType === 'recarve') {
      result = applyRecarveSigil(item.affixes!, affixIndex!, ctx);
    } else if (sigilType === 'temper') {
      result = applyTemperSigil(item.affixes!, affixIndex!, ctx);
    } else {
      result = applyEnhanceSigil(item.affixes!, affixIndex!);
    }

    // 池抽空之類的「沒有東西可換」不消耗印記
    if (result.affixes === item.affixes) {
      setResultMsg(result.message);
      return;
    }
    commit(result.message, { affixes: result.affixes });

    if (sigilType === 'enhance') {
      // 突破：兩拍，時間軸與強化共用，只有顏色與浮字換掉（§ 48.5）
      const newTier = result.affixes[affixIndex!]?.tier ?? 1;
      playFx({
        mode: result.success ? 'break-ok' : 'break-fail',
        affixIndex: affixIndex!,
        color: result.success ? TIER_COLOR[newTier] : 'var(--accent-danger)',
        label: `T${newTier}`,
      });
    } else if (sigilType === 'chaos') {
      playFx({ mode: 'chaos', color: SWEEP_COLOR.chaos });
    } else {
      playFx({ mode: 'sweep', affixIndex: affixIndex!, color: SWEEP_COLOR[sigilType] });
    }
  }

  /**
   * 消耗與成功率（動作鈕不重複寫，按鈕只留「使用{印記名}」）。
   * 突破印記的成功率跟著**目前選到的那條詞綴**走，沒選就把兩段都列出來。
   */
  function renderCost() {
    // 金幣接在印記後面當同一句（「工藝印記 ×1 ＋ 50,000G」），不另起一段
    const cost = sigilType === 'polish'
      ? `${display.name} ×1 ＋ ${POLISH_SIGIL_GOLD_COST.toLocaleString()}G`
      : `${display.name} ×1`;
    const parts: string[] = [`消耗：${cost}`];
    if (def.target === 'item') parts.push('對象是整件裝備，不需指定詞綴');
    if (sigilType === 'temper') parts.push('必定成功');

    if (sigilType !== 'enhance') return <>{parts.join('　')}</>;

    const tier = affixIndex != null ? affixes[affixIndex]?.tier : undefined;
    const rate = tier != null ? getEnhanceSigilRate(tier) : undefined;
    parts.push(rate != null
      ? `成功率 ${Math.round(rate * 100)}%（T${tier} → T${tier! + 1}）`
      : '成功率 T5→T6 10%、T6→T7 2%');
    return (
      <>
        {parts.join('　')}
        <span className="sigil-cost-warn">　失敗時該詞綴掉回 T1，印記照樣消耗</span>
      </>
    );
  }

  /** 動作鈕停不下來的原因。判定順序＝玩家會先撞到的先講 */
  function blockReason(): string | null {
    if (!item) return '沒有裝備';
    const starter = inertReason(item);
    if (starter) return starter === '新手裝' ? '新手裝不可使用任何印記' : '這件裝備沒有詞綴';
    if (sigilCounts[sigilType] <= 0) return `背包裡沒有${display.name}`;
    if (def.target === 'affix' && affixIndex == null) return '請先選一條詞綴';
    const check = canUseSigil(sigilType, affixes, affixIndex ?? undefined, {
      isStarterGear: false,
      maxAffixTier: item.maxAffixTier,
      quality: item.quality ?? 0,
    });
    if (!check.ok) return check.reason ?? '無法使用';
    if (sigilType === 'polish' && char!.gold < POLISH_SIGIL_GOLD_COST) return '金幣不足';
    return null;
  }

  function selectItem(id: number | undefined) {
    if (id == null) return;
    setSelectedItemId(id);
    // 換裝備就清掉詞綴選取；印記選擇保留（玩家通常是拿同一種印記掃好幾件）
    setAffixIndex(null);
    setResultMsg(null);
  }

  function renderPickerGroup(label: string, rows: Entry[]) {
    return (
      <>
        <div className="sigil-picker-group">── {label} ({rows.length}) ──</div>
        {rows.map(e => {
          const inert = inertReason(e.item);
          /*
           * 圖示與 Tier 色與背包／裝備欄同源（防具用部位、武器用類型；色取
           * `getEquipmentInstanceTierColor`），同一件裝備在三個地方不會長成三種樣子。
           * 印記不受理的（新手裝／無詞綴）維持灰階不上色（`13-town.md` § 13.13）——
           * 上了 Tier 色就跟能操作的列看起來一樣了。
           */
          const tierColor = inert ? undefined : getEquipmentInstanceTierColor(e.item, allTemplates);
          return (
            <button
              key={e.item.id}
              type="button"
              className={`sigil-picker-row${e.item.id === item?.id ? ' is-selected' : ''}${inert ? ' is-inert' : ''}`}
              onClick={() => selectItem(e.item.id)}
            >
              <span className="sigil-picker-icon">
                <GameIcon
                  name={getEquipIcon(e.item.type === 'armor' ? e.item.slot : e.item.type)}
                  size={16}
                  color={tierColor}
                />
              </span>
              <span className="sigil-picker-name" style={tierColor ? { color: tierColor } : undefined}>
                {e.item.name}{(e.item.enhancement ?? 0) > 0 ? ` +${e.item.enhancement}` : ''}
              </span>
              <span className="sigil-picker-tag">
                {inert ?? (e.slot ? SLOT_NAMES[e.slot] : '背包')}
              </span>
            </button>
          );
        })}
      </>
    );
  }

  /**
   * 詞綴列的演出。
   *
   * 面板在 commit 之後就顯示**新的**詞綴了，所以演的一律是「新值登場」——
   * 不做舊值退場（那需要把舊值多留一份在畫面上，代價不成比例）。
   */
  function fxForRow(i: number): (SigilFx & { token: number }) | null {
    if (!fx) return null;
    if (fx.mode === 'chaos') return fx;
    return fx.affixIndex === i ? fx : null;
  }

  function tagFxClass(rowFx: (SigilFx & { token: number }) | null): string {
    if (!rowFx) return '';
    if (rowFx.mode === 'chaos') return ' sig-chaos';
    if (rowFx.mode === 'break-ok') return ' enh-pop';
    if (rowFx.mode === 'break-fail') return ' sig-tier-down';
    return ' sig-tier-up';
  }

  function valueFxClass(rowFx: (SigilFx & { token: number }) | null): string {
    if (!rowFx) return '';
    if (rowFx.mode === 'chaos') return ' sig-chaos';
    if (rowFx.mode === 'sweep') return ' sig-reroll';
    return '';
  }

  function renderFxLayer(active: SigilFx & { token: number }) {
    const style = active.color
      ? ({ '--sig-color': active.color, '--fx-burst-color': active.color } as React.CSSProperties)
      : undefined;
    return (
      /* key 帶 token：連點時若沿用同一個 DOM 節點，CSS 動畫不會重跑（演出等於沒播） */
      <span key={active.token} className="sig-fx-layer" style={style} data-testid={`sigil-fx-${active.mode}`}>
        {active.mode === 'break-ok' && (
          <>
            <span className="enh-flash-gold" />
            <span className="enh-ring" />
            <span className="enh-ring delay" />
            <span className="enh-float">{active.label}</span>
            <span className="enh-flash-soft" />
          </>
        )}
        {active.mode === 'break-fail' && (
          <>
            <span className="enh-flash-red" />
            <span className="enh-float is-down">{active.label}</span>
            <span className="enh-flash-soft" />
          </>
        )}
        {(active.mode === 'sweep' || active.mode === 'chaos' || active.mode === 'polish') && (
          <span className="sig-sweep" />
        )}
      </span>
    );
  }

  const blocked = blockReason();
  const maxAffixTier = item?.maxAffixTier ?? DEFAULT_MAX_AFFIX_TIER;

  return (
    <div className="shop-panel sigil-panel">
      <div className="sigil-head">
        <p className="sigil-greeting">
          「詞綴不合意？印記能重新刻過 —— 但別怪我沒提醒，運氣不好會更糟。」
        </p>
        <span className="sigil-gold">金幣 {char.gold.toLocaleString()}G</span>
      </div>

      <div className="sigil-body">
        {/* 左欄：裝備清單。身上與背包同一份，用分組標題分開 */}
        <div className="sigil-col">
          <p className="sigil-section-title">裝備</p>
          <div className="sigil-picker">
            {allEntries.length === 0 && <p className="empty-text">沒有裝備</p>}
            {equippedEntries.length > 0 && renderPickerGroup('裝備中', equippedEntries)}
            {bagEntries.length > 0 && renderPickerGroup('背包', bagEntries)}
          </div>
        </div>

        {/* 右欄：裝備摘要 → 詞綴 → 印記 */}
        <div className="sigil-col">
          {item && (
            <div className="sigil-summary">
              {fx?.mode === 'polish' && renderFxLayer(fx)}
              <div className="sigil-summary-main">
                {/* 強化等級跟著名稱走，與左欄清單、背包、裝備欄一致 */}
                {item.name}{(item.enhancement ?? 0) > 0 ? ` +${item.enhancement}` : ''}
                <span className="sigil-summary-slot">
                  {entry?.source === 'equipped' && entry.slot
                    ? `裝備中 · ${SLOT_NAMES[entry.slot]}`
                    : '背包'}
                </span>
              </div>
              <div className="sigil-summary-sub">
                <span className={(item.quality ?? 0) >= POLISH_SIGIL_QUALITY_MAX ? 'sigil-summary-cap' : ''}>
                  品質 <span
                    key={`quality-${fx?.mode === 'polish' ? fx.token : 0}`}
                    className={fx?.mode === 'polish' ? 'sig-quality-pop' : undefined}
                  >
                    {item.quality ?? 0}
                  </span>% / {POLISH_SIGIL_QUALITY_MAX}%
                </span>
                {/*
                  寫「精鍊上限」不是「詞綴上限」——`maxAffixTier` 是取得管道上限（§ 6A.6），
                  管的是掉落／製作／商店給的詞綴與精鍊印記推得到哪一階；突破印記「不看取得管道」
                  （§ 46.7），所以精鍊上限 T5 的裝備照樣可能帶 T6/T7。
                */}
                <span>
                  精鍊上限 T{maxAffixTier}
                  {maxAffixTier < DEFAULT_MAX_AFFIX_TIER ? '（商店裝）' : ''}
                </span>
                <span>詞綴 {affixes.length} 條</span>
              </div>
            </div>
          )}

          <p className="sigil-section-title">選擇詞綴</p>
          <div className={`sigil-affixes${def.target === 'item' ? ' is-item-target' : ''}`}>
            {affixes.length === 0 && (
              <p className="empty-text">{item && inertReason(item) === '新手裝' ? '新手裝沒有詞綴' : '這件裝備沒有詞綴'}</p>
            )}
            {affixes.map((affix, i) => {
              const check = checkAffix(i);
              const rowFx = fxForRow(i);
              return (
                <button
                  key={i}
                  type="button"
                  className={
                    `sigil-affix-row${affixIndex === i ? ' is-selected' : ''}`
                    + `${check.ok ? '' : ' is-disabled'}`
                    + `${rowFx?.mode === 'break-fail' ? ' enh-shake' : ''}`
                  }
                  aria-disabled={!check.ok}
                  onClick={() => { if (check.ok) { setAffixIndex(i); setResultMsg(null); } }}
                >
                  <span
                    key={`tag-${rowFx?.token ?? 0}`}
                    className={
                      (isSpecialAffixType(affix.type)
                        ? 'affix-tag special'
                        : `affix-tag tier-${affix.tier}${isMaxRollAffix(affix) ? ' max-roll' : ''}`)
                      + tagFxClass(rowFx)
                    }
                    style={fx?.mode === 'chaos' ? ({ '--i': i } as React.CSSProperties) : undefined}
                    title={isMaxRollAffix(affix) ? '此詞綴為該 Tier 最大值' : undefined}
                  >
                    {affixLabel(affix)}
                  </span>
                  <span key={`value-${rowFx?.token ?? 0}`} className={`sigil-affix-value${valueFxClass(rowFx)}`}>
                    {isSpecialAffixType(affix.type) ? '' : `+${affix.value}%`}
                  </span>
                  {/* 列上只放「不能選的原因」；消耗與成功率是整次操作共通的，收在下方 */}
                  {!check.ok && <span className="sigil-affix-reason">{check.reason}</span>}
                  {rowFx && renderFxLayer(rowFx)}
                </button>
              );
            })}
          </div>

          <p className="sigil-section-title">選擇印記</p>
          <div className="sigil-choices">
            {SIGIL_PANEL_ORDER.map(getSigilDefinition).map(d => {
              const owned = sigilCounts[d.type];
              const info = sigilDisplay(d.type);
              return (
                <button
                  key={d.type}
                  type="button"
                  className={`sigil-choice${d.type === sigilType ? ' is-selected' : ''}${owned <= 0 ? ' is-empty' : ''}`}
                  style={info.color ? ({ '--sigil-color': info.color } as React.CSSProperties) : undefined}
                  onClick={() => { setSigilType(d.type); setResultMsg(null); }}
                >
                  <span className="sigil-choice-dot" />
                  {/* 突破印記失敗不可逆（§ 46.7），選單上就先標一個記號 */}
                  {d.type === 'enhance' ? '⚠ ' : ''}{info.name}
                  <span className="sigil-choice-count">×{owned}</span>
                </button>
              );
            })}
          </div>
          <p className="sigil-desc">{def.description}</p>
          <p className="sigil-cost">{renderCost()}</p>
        </div>
      </div>

      <div className="sigil-footer">
        <span className={`sigil-footer-msg${blocked ? ' is-error' : ''}`}>
          {blocked ?? resultMsg ?? ''}
        </span>
        <button className="sigil-apply" onClick={handleApply} disabled={blocked != null}>
          使用{display.name}
        </button>
      </div>
    </div>
  );
}
