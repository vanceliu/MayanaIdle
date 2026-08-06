import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance, EquipSlot } from '../../models/equipment';
import {
  AFFIX_DEFINITIONS,
  getAffixCategoryForSlot,
  getSpecialAffixDefinition,
  getWeaponBaseDamage,
  isSpecialAffixType,
  isMaxRollAffix,
  type Affix,
} from '../../models/affix';
import {
  POLISH_SIGIL_GOLD_COST,
  SIGIL_DEFINITIONS,
  SIGIL_TABS,
  applyChaosSigil,
  applyEnhanceSigil,
  applyPolishSigil,
  applyRecarveSigil,
  applyStingSigil,
  applyTemperSigil,
  canUseSigil,
  getSigilDefinition,
  getUpgradeSigilFor,
  type SigilContext,
  type SigilResult,
  type SigilType,
} from '../../models/sigil';
import { EquipmentDetail } from '../EquipmentInfo';
import { db } from '../../db/database';
import { getBagItemAmount, consumeBagItem } from '../../models/bagItem';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';

const SLOT_NAMES: Record<EquipSlot, string> = {
  rightHand: '右手',
  leftHand: '左手',
  helmet: '頭盔',
  chest: '胸甲',
  belt: '腰帶',
  gloves: '手套',
  boots: '鞋子',
  necklace: '項鍊',
  ring1: '戒指1',
  ring2: '戒指2',
};

type Entry = { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot };

function affixLabel(affix: Affix): string {
  if (isSpecialAffixType(affix.type)) {
    return `[特殊] ${getSpecialAffixDefinition(affix.type)?.name ?? affix.type}`;
  }
  const def = AFFIX_DEFINITIONS.find(d => d.type === affix.type);
  return `${def?.name ?? affix.type} T${affix.tier}`;
}

export function SigilMaster() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const [tab, setTab] = useState<SigilType>('chaos');
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const allTemplates = useEquipmentTemplates();

  if (!char) return null;

  const sigilCounts = Object.fromEntries(
    SIGIL_DEFINITIONS.map(d => [d.type, getBagItemAmount(bagItems, d.itemId)]),
  ) as Record<SigilType, number>;

  // 升階分頁掛著精鍊與突破兩種印記（§ 46.2），故一個分頁可能對應多個定義
  const tabSigils = SIGIL_DEFINITIONS.filter(d => d.tab === tab);

  const allItems: Entry[] = [];
  for (const [slot, item] of Object.entries(equippedGear)) {
    if (item) allItems.push({ item, source: 'equipped', slot: slot as EquipSlot });
  }
  for (const item of inventory) allItems.push({ item, source: 'bag' });

  /** 新手裝名單只有 seed 一個來源（`99-ai-constraints.md` 第 4 條） */
  function isStarterGear(item: EquipmentInstance): boolean {
    return allTemplates.find(t => t.id === item.templateId)?.acquireType === 'starter';
  }

  function buildContext(item: EquipmentInstance): SigilContext {
    return {
      category: getAffixCategoryForSlot(item.slot, item.type),
      charLevel: char!.level,
      maxAffixTier: item.maxAffixTier,
      quality: item.quality ?? 0,
      weaponBaseDamage: getWeaponBaseDamage(item),
      isStarterGear: isStarterGear(item),
    };
  }

  /** 這條詞綴的下一階由哪一種印記受理（§ 46.2），連同持有數與成功率一起回 */
  function upgradeInfoFor(item: EquipmentInstance, affix: Affix) {
    const next = getUpgradeSigilFor(affix, item.maxAffixTier);
    if (!next) return undefined;
    return { ...next, def: getSigilDefinition(next.type), owned: sigilCounts[next.type] };
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

  /**
   * 扣掉一個印記並寫回裝備。`sigilType` 由呼叫端決定 —— 升階分頁會依詞綴的
   * Tier 消耗精鍊或突破印記，不能再從分頁反推消耗品。
   */
  function commit(
    entry: Entry,
    sigilType: SigilType,
    message: string,
    patch: Partial<EquipmentInstance>,
    goldCost = 0,
  ) {
    const { item, source, slot } = entry;
    const updatedItem = { ...item, ...patch };
    if (item.id) {
      db.equipmentInstances.update(item.id, patch);
    }

    const sigilItemId = getSigilDefinition(sigilType).itemId;
    const newBag = consumeBagItem(useGameStore.getState().bagItems, sigilItemId);
    persistBagItem(sigilItemId, sigilCounts[sigilType] - 1);

    const updatedChar = goldCost > 0 ? { ...char!, gold: char!.gold - goldCost } : char!;
    if (goldCost > 0 && char!.id) db.characters.update(char!.id, { gold: updatedChar.gold });

    if (source === 'equipped' && slot) {
      useGameStore.setState({
        character: updatedChar,
        equippedGear: { ...equippedGear, [slot]: updatedItem },
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

  function handleApply(entry: Entry, affixIndex?: number) {
    const { item } = entry;
    const ctx = buildContext(item);

    // § 46.8 工藝印記：對象是整件裝備，且是唯一要收金幣的印記
    if (tab === 'polish') {
      const check = canUseSigil('polish', item.affixes, undefined, ctx);
      if (!check.ok) return setResultMsg(check.reason ?? '無法使用');
      if (sigilCounts.polish <= 0) return;
      if (char!.gold < POLISH_SIGIL_GOLD_COST) return setResultMsg('金幣不足');
      const polished = applyPolishSigil(item.quality ?? 0);
      if (!polished.success) return setResultMsg(polished.message);
      commit(entry, 'polish', polished.message, { quality: polished.quality }, POLISH_SIGIL_GOLD_COST);
      return;
    }

    // 升階分頁：由詞綴的 Tier 決定這一次消耗精鍊還是突破印記
    const sigilType: SigilType = tab === 'enhance'
      ? (affixIndex != null && item.affixes?.[affixIndex]
          ? upgradeInfoFor(item, item.affixes[affixIndex])?.type ?? 'temper'
          : 'temper')
      : tab;

    const check = canUseSigil(sigilType, item.affixes, affixIndex, ctx);
    if (!check.ok) return setResultMsg(check.reason ?? '無法使用');
    if (sigilCounts[sigilType] <= 0) return;

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
    commit(entry, sigilType, result.message, { affixes: result.affixes });
  }

  function renderItemAction(entry: Entry) {
    const { item } = entry;
    const starter = isStarterGear(item);

    if (tab === 'chaos') {
      const check = canUseSigil('chaos', item.affixes, undefined, { isStarterGear: starter });
      return (
        <div className="shop-item-actions bs-actions">
          <div className="bs-action-summary">
            <span className="bs-action-cost">混沌印記×1</span>
            <span className="bs-action-warn">全部詞綴重骰</span>
          </div>
          <button onClick={() => handleApply(entry)} disabled={!check.ok || sigilCounts.chaos <= 0}>
            {check.ok ? '重骰全部詞綴' : check.reason}
          </button>
        </div>
      );
    }

    // § 46.8 品質提升：整件裝備 + 金幣，不指定詞綴
    if (tab === 'polish') {
      const check = canUseSigil('polish', item.affixes, undefined, {
        isStarterGear: starter,
        quality: item.quality ?? 0,
      });
      const poor = char!.gold < POLISH_SIGIL_GOLD_COST;
      return (
        <div className="shop-item-actions bs-actions">
          <div className="bs-action-summary">
            <span className="bs-action-cost">工藝印記×1 + {POLISH_SIGIL_GOLD_COST.toLocaleString()}G</span>
            <span className="bs-action-rate">品質 {item.quality ?? 0}% → {(item.quality ?? 0) + 1}%</span>
          </div>
          <button
            onClick={() => handleApply(entry)}
            disabled={!check.ok || poor || sigilCounts.polish <= 0}
          >
            {!check.ok ? check.reason : poor ? '金幣不足' : '提升品質'}
          </button>
        </div>
      );
    }

    const affixes = item.affixes ?? [];
    if (starter || affixes.length === 0) {
      return (
        <div className="shop-item-actions">
          <span className="bs-action-cost">{starter ? '新手裝不可使用' : '無詞綴'}</span>
        </div>
      );
    }

    return (
      <div className="shop-item-actions bs-actions">
        <div className="bs-affix-list">
          {affixes.map((affix, i) => {
            // 升階分頁：這一條由精鍊或突破受理，成功率與消耗品跟著換
            const upgrade = tab === 'enhance' ? upgradeInfoFor(item, affix) : undefined;
            const sigilType: SigilType = tab === 'enhance' ? (upgrade?.type ?? 'temper') : tab;
            const check = canUseSigil(sigilType, affixes, i, {
              isStarterGear: starter,
              maxAffixTier: item.maxAffixTier,
            });
            const rate = upgrade && upgrade.rate < 1 ? upgrade.rate : undefined;
            const owned = sigilCounts[sigilType];
            return (
              <div key={i} className="bs-affix-row">
                <span
                  className={isSpecialAffixType(affix.type)
                    ? 'affix-tag special'
                    : `affix-tag tier-${affix.tier}${isMaxRollAffix(affix) ? ' max-roll' : ''}`}
                  title={isMaxRollAffix(affix) ? '此詞綴為該 Tier 最大值' : undefined}
                >
                  {affixLabel(affix)}
                </span>
                {upgrade && (
                  <span className="bs-action-cost">
                    {upgrade.def.name}×1{rate != null ? ` · ${Math.round(rate * 100)}%` : ''}
                  </span>
                )}
                <button
                  className="bs-affix-btn"
                  onClick={() => handleApply(entry, i)}
                  disabled={!check.ok || owned <= 0}
                  title={check.reason ?? (upgrade ? `消耗${upgrade.def.name} ×1` : undefined)}
                >
                  {check.ok ? (upgrade ? '升階' : '使用') : '不可用'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="shop-panel blacksmith-panel">
      <p className="shop-greeting">「詞綴不合意？印記能重新刻過 —— 但別怪我沒提醒，運氣不好會更糟。」</p>
      <div className="bs-resources">
        <span>金幣: {char.gold.toLocaleString()}G</span>
        {SIGIL_DEFINITIONS.map(d => (
          <span key={d.type}>{d.name}: {sigilCounts[d.type]}</span>
        ))}
      </div>

      <div className="shop-tabs">
        {SIGIL_TABS.map(t => (
          <button
            key={t.tab}
            className={tab === t.tab ? 'active' : ''}
            onClick={() => { setTab(t.tab); setResultMsg(null); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabSigils.map(d => (
        <p key={d.type} className="shop-item-desc">{d.name}：{d.description}</p>
      ))}
      {resultMsg && <p className="bs-result">{resultMsg}</p>}
      {tabSigils.every(d => sigilCounts[d.type] <= 0) && (
        <p className="empty-text">背包裡沒有{tabSigils.map(d => d.name).join('或')}</p>
      )}

      <div className="panel-scroll">
        <div className="shop-items">
          {allItems.length === 0 && <p className="empty-text">沒有裝備</p>}
          {allItems.map(entry => (
            <div key={entry.item.id} className="shop-item bs-shop-item">
              <div className="shop-item-info">
                {entry.source === 'equipped' && entry.slot && (
                  <span className="bs-slot-tag">[{SLOT_NAMES[entry.slot]}]</span>
                )}
                <EquipmentDetail item={entry.item} templates={allTemplates} />
              </div>
              {renderItemAction(entry)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
