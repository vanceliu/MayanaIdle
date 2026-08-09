import { useGameStore, selectVillageRules } from '../stores/gameStore';
import type {
  VillageRule, VillageCondition, VillageAction,
  VillageConditionType, VillageActionType, EquipmentKeepFilter,
} from '../models/villageScript';
import {
  VILLAGE_CONDITION_LABELS as CONDITION_LABELS,
  VILLAGE_ACTION_LABELS as ACTION_LABELS,
} from '../models/villageScript';
import { MATERIAL_TIER_OPTIONS, EQUIPMENT_TIER_OPTIONS } from '../systems/shop';
import { ALL_TOWN_SCROLLS } from '../models/townScroll';
import { ITEM_DEFINITIONS } from '../db/seed';
import type { ItemDefinition } from '../models/items';

/** 需要選倉庫的動作 */
const WAREHOUSE_ACTIONS: VillageActionType[] = [
  'deposit_materials', 'deposit_equipment', 'withdraw_item',
];

/** 可買賣的道具：有價格的才列，避免下拉出現一堆買不到的東西 */
const PURCHASABLE_ITEMS: { id: number; name: string }[] = (ITEM_DEFINITIONS as ItemDefinition[])
  .filter(d => !!d.buyPrice)
  .map(d => ({ id: d.id, name: d.name }));

const KEEP_TYPE_OPTIONS = [
  { value: 'armor', label: '防具' },
  { value: 'sword', label: '劍' },
  { value: 'axe', label: '斧' },
  { value: 'mace', label: '鎚' },
  { value: 'staff', label: '法杖' },
  { value: 'bow', label: '弓' },
  { value: 'claw', label: '鋼爪' },
  { value: 'dualblade', label: '雙刃' },
];

export function VillageScriptEditor() {
  const villageRules = useGameStore(selectVillageRules);
  const setVillageRules = useGameStore(s => s.setVillageRules);

  function update(idx: number, updates: Partial<VillageRule>) {
    const rules = [...villageRules];
    rules[idx] = { ...rules[idx], ...updates };
    setVillageRules(rules);
  }

  function updateCondition(idx: number, condIdx: number, updates: Partial<VillageCondition>) {
    const rules = [...villageRules];
    rules[idx] = {
      ...rules[idx],
      conditions: rules[idx].conditions.map((c, i) => (i === condIdx ? { ...c, ...updates } : c)),
    };
    setVillageRules(rules);
  }

  function addCondition(idx: number) {
    const rules = [...villageRules];
    rules[idx] = { ...rules[idx], conditions: [...rules[idx].conditions, { type: 'always' }] };
    setVillageRules(rules);
  }

  function removeCondition(idx: number, condIdx: number) {
    const rules = [...villageRules];
    rules[idx] = { ...rules[idx], conditions: rules[idx].conditions.filter((_, i) => i !== condIdx) };
    setVillageRules(rules);
  }

  function updateAction(idx: number, updates: Partial<VillageAction>) {
    const rules = [...villageRules];
    rules[idx] = { ...rules[idx], action: { ...rules[idx].action, ...updates } };
    setVillageRules(rules);
  }

  function updateKeep(idx: number, updates: Partial<EquipmentKeepFilter>) {
    const rules = [...villageRules];
    rules[idx] = {
      ...rules[idx],
      action: { ...rules[idx].action, keep: { ...rules[idx].action.keep, ...updates } },
    };
    setVillageRules(rules);
  }

  function moveRule(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= villageRules.length) return;
    const rules = [...villageRules];
    [rules[idx], rules[next]] = [rules[next], rules[idx]];
    setVillageRules(rules);
  }

  function addRule() {
    setVillageRules([...villageRules, {
      id: `village-${Date.now()}`,
      enabled: true,
      conditions: [{ type: 'always' }],
      action: { type: 'sell_materials', maxTier: 1, skipCraftMaterials: true },
    }]);
  }

  function removeRule(idx: number) {
    setVillageRules(villageRules.filter((_, i) => i !== idx));
  }

  const needsValue = (type: VillageConditionType) => type !== 'always';
  /** 金幣是六七位數，不能跟「幾格」「幾個」共用那個兩位數寬的輸入格 */
  const isGoldCondition = (type: VillageConditionType) => type === 'gold_below' || type === 'gold_above';

  return (
    <div className="script-editor-content">
      <p className="script-hint">由上往下判定，第一個符合且做得到的規則會被執行。</p>

      {villageRules.length === 0 && (
        <p className="script-hint">尚無規則，村莊腳本不執行任何動作。</p>
      )}

      <div className="script-rules">
        {villageRules.map((rule, idx) => (
          <div key={rule.id} className={`script-rule ${rule.enabled ? '' : 'disabled'}`}>
            <div className="rule-header">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={e => update(idx, { enabled: e.target.checked })}
              />
              <span className="rule-num">#{idx + 1}</span>
              <button onClick={() => moveRule(idx, -1)} disabled={idx === 0}>▲</button>
              <button onClick={() => moveRule(idx, 1)} disabled={idx === villageRules.length - 1}>▼</button>
              <button className="btn-remove" onClick={() => removeRule(idx)}>✕</button>
            </div>

            <div className="rule-body">
              {rule.conditions.length === 0 && (
                <div className="rule-condition">
                  <span>如果</span>
                  <span className="cond-empty">無條件（永遠成立）</span>
                </div>
              )}
              {rule.conditions.map((cond, condIdx) => (
                <div className="rule-condition" key={condIdx}>
                  <span>{condIdx === 0 ? '如果' : '且'}</span>
                  <select
                    value={cond.type}
                    onChange={e => updateCondition(idx, condIdx, { type: e.target.value as VillageConditionType })}
                  >
                    {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  {cond.type === 'item_count_below' && (
                    <select
                      aria-label="道具"
                      value={cond.itemId ?? ''}
                      onChange={e => updateCondition(idx, condIdx, { itemId: Number(e.target.value) })}
                    >
                      <option value="">選擇道具</option>
                      {PURCHASABLE_ITEMS.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  )}
                  {needsValue(cond.type) && (
                    <>
                      <input
                        type="number"
                        min={0}
                        className={isGoldCondition(cond.type) ? 'num-gold' : undefined}
                        value={cond.value ?? 0}
                        onChange={e => updateCondition(idx, condIdx, { value: Number(e.target.value) })}
                      />
                      {isGoldCondition(cond.type) && <span className="unit-label">G</span>}
                    </>
                  )}
                  <button
                    className="btn-remove-cond"
                    aria-label="刪除條件"
                    onClick={() => removeCondition(idx, condIdx)}
                  >✕</button>
                </div>
              ))}
              <button className="btn-add-cond" onClick={() => addCondition(idx)}>＋ 條件</button>

              <div className="rule-action">
                <span>→</span>
                <select
                  value={rule.action.type}
                  onChange={e => {
                    const type = e.target.value as VillageActionType;
                    const defaults: Partial<VillageAction> = { type };
                    if (type === 'sell_materials') { defaults.maxTier = 1; defaults.skipCraftMaterials = true; }
                    if (type === 'sell_equipment') { defaults.maxTier = 1; }
                    if (type === 'deposit_materials') { defaults.maxTier = 1; defaults.skipCraftMaterials = false; }
                    if (WAREHOUSE_ACTIONS.includes(type)) { defaults.warehouse = 'shared'; }
                    updateAction(idx, defaults);
                  }}
                >
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>

                {rule.action.type === 'return_town' && (
                  <select
                    aria-label="回城卷軸"
                    value={rule.action.scrollTownId ?? ''}
                    onChange={e => updateAction(idx, { scrollTownId: e.target.value || undefined })}
                  >
                    <option value="">任意卷軸</option>
                    {ALL_TOWN_SCROLLS.map(s => (
                      <option key={s.townId} value={s.townId}>{s.townName}</option>
                    ))}
                  </select>
                )}

                {rule.action.type === 'buy_item' && (
                  <>
                    <select
                      aria-label="購買道具"
                      value={rule.action.itemId ?? ''}
                      onChange={e => updateAction(idx, { itemId: Number(e.target.value) })}
                    >
                      <option value="">選擇道具</option>
                      {PURCHASABLE_ITEMS.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <input
                      type="number"
                      min={0}
                      aria-label="目標數量"
                      value={rule.action.targetAmount ?? 0}
                      onChange={e => updateAction(idx, { targetAmount: Number(e.target.value) })}
                    />
                    <span className="unit-label">個</span>
                  </>
                )}

                {WAREHOUSE_ACTIONS.includes(rule.action.type) && (
                  <select
                    aria-label="倉庫"
                    value={rule.action.warehouse ?? 'shared'}
                    onChange={e => updateAction(idx, { warehouse: e.target.value as 'shared' | 'personal' })}
                  >
                    <option value="shared">共用倉庫</option>
                    <option value="personal">個人倉庫</option>
                  </select>
                )}

                {(rule.action.type === 'withdraw_item') && (
                  <>
                    <select
                      aria-label="取出道具"
                      value={rule.action.itemId ?? ''}
                      onChange={e => updateAction(idx, { itemId: Number(e.target.value) })}
                    >
                      <option value="">選擇道具</option>
                      {PURCHASABLE_ITEMS.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <input
                      type="number"
                      min={0}
                      aria-label="目標數量"
                      value={rule.action.targetAmount ?? 0}
                      onChange={e => updateAction(idx, { targetAmount: Number(e.target.value) })}
                    />
                    <span className="unit-label">個</span>
                  </>
                )}

                {rule.action.type === 'deposit_gold' && (
                  <>
                    <input
                      type="number"
                      min={0}
                      className="num-gold"
                      aria-label="身上留下的金幣"
                      value={rule.action.keepGold ?? 0}
                      onChange={e => updateAction(idx, { keepGold: Number(e.target.value) })}
                    />
                    <span className="unit-label">G</span>
                  </>
                )}

                {rule.action.type === 'withdraw_gold' && (
                  <>
                    <input
                      type="number"
                      min={0}
                      className="num-gold"
                      aria-label="目標金幣"
                      value={rule.action.targetAmount ?? 0}
                      onChange={e => updateAction(idx, { targetAmount: Number(e.target.value) })}
                    />
                    <span className="unit-label">G</span>
                  </>
                )}

                {rule.action.type === 'deposit_materials' && (
                  <select
                    aria-label="存入素材等級"
                    value={rule.action.maxTier ?? 1}
                    onChange={e => updateAction(idx, { maxTier: Number(e.target.value) })}
                  >
                    {MATERIAL_TIER_OPTIONS.map(o => <option key={o.tier} value={o.tier}>{o.label}</option>)}
                  </select>
                )}

                {rule.action.type === 'sell_materials' && (
                  <>
                    <select
                      aria-label="素材等級"
                      value={rule.action.maxTier ?? 1}
                      onChange={e => updateAction(idx, { maxTier: Number(e.target.value) })}
                    >
                      {MATERIAL_TIER_OPTIONS.map(o => <option key={o.tier} value={o.tier}>{o.label}</option>)}
                    </select>
                    <label className="village-inline-check">
                      <input
                        type="checkbox"
                        checked={rule.action.skipCraftMaterials ?? true}
                        onChange={e => updateAction(idx, { skipCraftMaterials: e.target.checked })}
                      />
                      保留配方素材
                    </label>
                  </>
                )}

                {rule.action.type === 'sell_equipment' && (
                  <select
                    aria-label="裝備等級"
                    value={rule.action.maxTier ?? 1}
                    onChange={e => updateAction(idx, { maxTier: Number(e.target.value) })}
                  >
                    {EQUIPMENT_TIER_OPTIONS.map(o => <option key={o.tier} value={o.tier}>{o.label}</option>)}
                  </select>
                )}
              </div>

              {(rule.action.type === 'sell_equipment' || rule.action.type === 'deposit_equipment') && (
                <div className="village-keep">
                  <div className="village-keep-title">
                    {rule.action.type === 'sell_equipment'
                      ? '保留條件（符合任一就不賣）'
                      : '存入條件（符合任一就存）'}
                  </div>
                  <label className="village-inline-check">
                    <input
                      type="checkbox"
                      checked={rule.action.keep?.affixTierAbove != null}
                      onChange={e => updateKeep(idx, { affixTierAbove: e.target.checked ? 5 : undefined })}
                    />
                    詞綴 Tier 高於
                  </label>
                  {rule.action.keep?.affixTierAbove != null && (
                    <input
                      type="number"
                      min={1}
                      max={7}
                      aria-label="詞綴 Tier 門檻"
                      value={rule.action.keep.affixTierAbove}
                      onChange={e => updateKeep(idx, { affixTierAbove: Number(e.target.value) })}
                    />
                  )}
                  <label className="village-inline-check">
                    <input
                      type="checkbox"
                      checked={!!rule.action.keep?.classUsable}
                      onChange={e => updateKeep(idx, { classUsable: e.target.checked || undefined })}
                    />
                    本職業可裝備的
                  </label>
                  <div className="village-keep-types">
                    {KEEP_TYPE_OPTIONS.map(opt => {
                      const checked = rule.action.keep?.equipTypes?.includes(opt.value) ?? false;
                      return (
                        <label key={opt.value} className="village-inline-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              const current = rule.action.keep?.equipTypes ?? [];
                              const next = e.target.checked
                                ? [...current, opt.value]
                                : current.filter(t => t !== opt.value);
                              updateKeep(idx, { equipTypes: next.length ? next : undefined });
                            }}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button className="btn-add-rule" onClick={addRule}>+ 新增規則</button>
    </div>
  );
}
