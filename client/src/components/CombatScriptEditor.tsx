import { useGameStore, selectCombatRules } from '../stores/gameStore';
import type { CombatRule, CombatConditionType, CombatActionType, CombatCondition, CombatAction } from '../models/scriptEngine';
import {
  DEFAULT_NEAR_SELF_RADIUS,
  COMBAT_CONDITION_LABELS as CONDITION_LABELS,
  COMBAT_CONDITION_HINTS as CONDITION_HINTS,
  COMBAT_ACTION_LABELS as ACTION_LABELS,
} from '../models/scriptEngine';

export function CombatScriptEditor() {
  const combatRules = useGameStore(selectCombatRules);
  const skills = useGameStore(s => s.skills);
  const setCombatRules = useGameStore(s => s.setCombatRules);

  const attackSkills = skills.filter(s => s.type === 'attack');

  /**
   * 沒有任何「啟用的攻擊規則」時角色會完全不出手（`41-arpg-combat.md`）。
   * 引擎刻意不再偷偷退回普通攻擊，所以這個狀態必須讓玩家看得見，
   * 否則會以為是遊戲壞掉。
   */
  const hasEnabledAttackRule = combatRules.some(rule => {
    if (!rule.enabled) return false;
    if (rule.action.type === 'normal_attack') return true;
    if (rule.action.type !== 'skill' || !rule.action.skillId) return false;
    // 技能規則要指到「已學會的攻擊技能」才算數
    return attackSkills.some(s => s.id === rule.action.skillId);
  });

  function updateRule(idx: number, updates: Partial<CombatRule>) {
    const rules = [...combatRules];
    rules[idx] = { ...rules[idx], ...updates };
    setCombatRules(rules);
  }

  function updateCondition(idx: number, condIdx: number, updates: Partial<CombatCondition>) {
    const rules = [...combatRules];
    const conditions = rules[idx].conditions.map((c, i) => (i === condIdx ? { ...c, ...updates } : c));
    rules[idx] = { ...rules[idx], conditions };
    setCombatRules(rules);
  }

  function addCondition(idx: number) {
    const rules = [...combatRules];
    rules[idx] = { ...rules[idx], conditions: [...rules[idx].conditions, { type: 'always' }] };
    setCombatRules(rules);
  }

  function removeCondition(idx: number, condIdx: number) {
    const rules = [...combatRules];
    rules[idx] = { ...rules[idx], conditions: rules[idx].conditions.filter((_, i) => i !== condIdx) };
    setCombatRules(rules);
  }

  function updateAction(idx: number, updates: Partial<CombatAction>) {
    const rules = [...combatRules];
    rules[idx] = { ...rules[idx], action: { ...rules[idx].action, ...updates } };
    setCombatRules(rules);
  }

  function moveRule(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= combatRules.length) return;
    const rules = [...combatRules];
    [rules[idx], rules[newIdx]] = [rules[newIdx], rules[idx]];
    setCombatRules(rules);
  }

  function addRule() {
    const newRule: CombatRule = {
      id: `combat-${Date.now()}`,
      enabled: true,
      conditions: [{ type: 'always' }],
      action: { type: 'normal_attack' },
    };
    setCombatRules([...combatRules, newRule]);
  }

  function removeRule(idx: number) {
    setCombatRules(combatRules.filter((_, i) => i !== idx));
  }

  const needsValue = (type: CombatConditionType) =>
    ['monster_count_gte', 'monsters_near_self_gte', 'aoe_hit_count_gte',
     'monster_hp_below', 'monster_hp_above', 'mp_above', 'mp_below'].includes(type);

  const isPercentCondition = (type: CombatConditionType) =>
    ['monster_hp_below', 'monster_hp_above', 'mp_above', 'mp_below'].includes(type);

  /** 只有「自身周圍怪物數」需要玩家自己指定半徑，其餘條件的圈由規則自己的射程決定 */
  const needsRadius = (type: CombatConditionType) => type === 'monsters_near_self_gte';

  return (
    <div className="script-editor-content">
      <p className="script-hint">僅在戰鬥中執行。由上往下判定，第一個符合條件的規則會被執行。</p>

      {!hasEnabledAttackRule && (
        <p className="script-warning" role="alert">
          ⚠ 沒有任何啟用的攻擊規則，角色不會出手。加一條「普通攻擊」或啟用攻擊技能規則。
        </p>
      )}

      <div className="script-rules">
        {combatRules.map((rule, idx) => (
          <div key={rule.id} className={`script-rule ${rule.enabled ? '' : 'disabled'}`}>
            <div className="rule-header">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={e => updateRule(idx, { enabled: e.target.checked })}
              />
              <span className="rule-num">#{idx + 1}</span>
              <button onClick={() => moveRule(idx, -1)} disabled={idx === 0}>▲</button>
              <button onClick={() => moveRule(idx, 1)} disabled={idx === combatRules.length - 1}>▼</button>
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
                    title={CONDITION_HINTS[cond.type] ?? ''}
                    onChange={e => updateCondition(idx, condIdx, { type: e.target.value as CombatConditionType })}
                  >
                    {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  {needsValue(cond.type) && (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={cond.value ?? 0}
                        onChange={e => updateCondition(idx, condIdx, { value: Number(e.target.value) })}
                      />
                      {isPercentCondition(cond.type) && <span className="unit-label">%</span>}
                    </>
                  )}
                  {needsRadius(cond.type) && (
                    <>
                      <span className="unit-label">隻，半徑</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={cond.radius ?? DEFAULT_NEAR_SELF_RADIUS}
                        onChange={e => updateCondition(idx, condIdx, { radius: Number(e.target.value) })}
                      />
                      <span className="unit-label">碼</span>
                    </>
                  )}
                  {cond.type === 'skill_ready' && (
                    <select
                      value={cond.skillId ?? ''}
                      onChange={e => updateCondition(idx, condIdx, { skillId: e.target.value })}
                    >
                      <option value="">選擇技能</option>
                      {attackSkills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
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
                  onChange={e => updateAction(idx, { type: e.target.value as CombatActionType })}
                >
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                {rule.action.type === 'skill' && (
                  <select
                    value={rule.action.skillId ?? ''}
                    onChange={e => updateAction(idx, { skillId: e.target.value })}
                  >
                    <option value="">選擇技能</option>
                    {attackSkills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn-add-rule" onClick={addRule}>+ 新增規則</button>
    </div>
  );
}
