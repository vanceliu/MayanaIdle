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
  SIGIL_DEFINITIONS,
  applyChaosSigil,
  applyEnhanceSigil,
  applyRecarveSigil,
  applyStingSigil,
  canUseSigil,
  getEnhanceSigilRate,
  type SigilContext,
  type SigilResult,
  type SigilType,
} from '../../models/sigil';
import { EquipmentDetail } from '../EquipmentInfo';
import { db } from '../../db/database';
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
    SIGIL_DEFINITIONS.map(d => [d.type, bagItems.find(b => b.name === d.itemName)?.amount ?? 0]),
  ) as Record<SigilType, number>;

  const activeSigil = SIGIL_DEFINITIONS.find(d => d.type === tab)!;
  const owned = sigilCounts[tab];

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
      weaponBaseDamage: getWeaponBaseDamage(item),
      isStarterGear: isStarterGear(item),
    };
  }

  function persistBagItem(name: string, newAmount: number) {
    if (!char?.id) return;
    if (newAmount <= 0) {
      db.characterBag.where({ characterId: char.id, name }).delete();
    } else {
      db.characterBag.where({ characterId: char.id, name }).modify({ amount: newAmount });
    }
  }

  function commit(entry: Entry, result: SigilResult) {
    const { item, source, slot } = entry;
    const updatedItem = { ...item, affixes: result.affixes };
    if (item.id) {
      db.equipmentInstances.update(item.id, { affixes: result.affixes });
    }

    const itemName = activeSigil.itemName;
    const remaining = owned - 1;
    const newBag = useGameStore.getState().bagItems
      .map(b => (b.name === itemName ? { ...b, amount: b.amount - 1 } : b))
      .filter(b => b.amount > 0);
    persistBagItem(itemName, remaining);

    if (source === 'equipped' && slot) {
      useGameStore.setState({
        equippedGear: { ...equippedGear, [slot]: updatedItem },
        bagItems: newBag,
      });
    } else {
      useGameStore.setState({
        inventory: inventory.map(i => (i.id === item.id ? updatedItem : i)),
        bagItems: newBag,
      });
    }

    setResultMsg(`${item.name}｜${result.message}`);
    useGameStore.getState().saveState();
  }

  function handleApply(entry: Entry, affixIndex?: number) {
    if (owned <= 0) return;
    const { item } = entry;
    const ctx = buildContext(item);
    const check = canUseSigil(tab, item.affixes, affixIndex, ctx);
    if (!check.ok) {
      setResultMsg(check.reason ?? '無法使用');
      return;
    }

    let result: SigilResult;
    if (tab === 'chaos') {
      result = applyChaosSigil(ctx);
    } else if (tab === 'sting') {
      result = applyStingSigil(item.affixes!, affixIndex!, ctx);
    } else if (tab === 'recarve') {
      result = applyRecarveSigil(item.affixes!, affixIndex!, ctx);
    } else {
      result = applyEnhanceSigil(item.affixes!, affixIndex!);
    }

    // 池抽空之類的「沒有東西可換」不消耗印記
    if (result.affixes === item.affixes) {
      setResultMsg(result.message);
      return;
    }
    commit(entry, result);
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
          <button onClick={() => handleApply(entry)} disabled={!check.ok || owned <= 0}>
            {check.ok ? '重骰全部詞綴' : check.reason}
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
            const check = canUseSigil(tab, affixes, i, { isStarterGear: starter });
            const rate = tab === 'enhance' && !isSpecialAffixType(affix.type)
              ? getEnhanceSigilRate(affix.tier)
              : undefined;
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
                {rate != null && <span className="bs-action-rate">{Math.round(rate * 100)}%</span>}
                <button
                  className="bs-affix-btn"
                  onClick={() => handleApply(entry, i)}
                  disabled={!check.ok || owned <= 0}
                  title={check.reason}
                >
                  {check.ok ? '使用' : '不可用'}
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
        {SIGIL_DEFINITIONS.map(d => (
          <span key={d.type}>{d.name}: {sigilCounts[d.type]}</span>
        ))}
      </div>

      <div className="shop-tabs">
        {SIGIL_DEFINITIONS.map(d => (
          <button
            key={d.type}
            className={tab === d.type ? 'active' : ''}
            onClick={() => { setTab(d.type); setResultMsg(null); }}
          >
            {d.name}
          </button>
        ))}
      </div>

      <p className="shop-item-desc">{activeSigil.description}</p>
      {resultMsg && <p className="bs-result">{resultMsg}</p>}
      {owned <= 0 && <p className="empty-text">背包裡沒有{activeSigil.name}</p>}

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
