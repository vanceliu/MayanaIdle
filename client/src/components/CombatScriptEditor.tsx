import { useGameStore } from '../stores/gameStore';
import type { CombatRule, CombatConditionType, CombatActionType, CombatCondition, CombatAction } from '../models/scriptEngine';

const CONDITION_LABELS: Record<CombatConditionType, string> = {
  always: '永遠',
  monster_count_gte: '怪物數量 ≥',
  monster_hp_below: '怪物 HP 低於',
  mp_above: 'MP 高於',
  mp_below: 'MP 低於',
  skill_ready: '技能就緒',
};

const ACTION_LABELS: Record<CombatActionType, string> = {
  skill: '施放攻擊技能',
  normal_attack: '普通攻擊',
  wait: '不動作',
};

export function CombatScriptEditor() {
  const combatRules = useGameStore(s => s.combatRules);
  const skills = useGameStore(s => s.skills);
  const setCombatRules = useGameStore(s => s.setCombatRules);

  const attackSkills = skills.filter(s => s.type === 'attack');

  function updateRule(idx: number, updates: Partial<CombatRule>) {
    const rules = [...combatRules];
    rules[idx] = { ...rules[idx], ...updates };
    setCombatRules(rules);
  }

  function updateCondition(idx: number, updates: Partial<CombatCondition>) {
    const rules = [...combatRules];
    rules[idx] = { ...rules[idx], condition: { ...rules[idx].condition, ...updates } };
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
      condition: { type: 'always' },
      action: { type: 'normal_attack' },
    };
    setCombatRules([...combatRules, newRule]);
  }

  function removeRule(idx: number) {
    setCombatRules(combatRules.filter((_, i) => i !== idx));
  }

  const needsValue = (type: CombatConditionType) =>
    ['monster_count_gte', 'monster_hp_below', 'mp_above', 'mp_below'].includes(type);

  return (
    <div className="script-editor-content">
      <p className="script-hint">僅在戰鬥中執行。由上往下判定，第一個符合條件的規則會被執行。</p>

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
              <div className="rule-condition">
                <span>如果</span>
                <select
                  value={rule.condition.type}
                  onChange={e => updateCondition(idx, { type: e.target.value as CombatConditionType })}
                >
                  {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                {needsValue(rule.condition.type) && (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rule.condition.value ?? 0}
                    onChange={e => updateCondition(idx, { value: Number(e.target.value) })}
                  />
                )}
                {rule.condition.type === 'skill_ready' && (
                  <select
                    value={rule.condition.skillId ?? ''}
                    onChange={e => updateCondition(idx, { skillId: e.target.value })}
                  >
                    <option value="">選擇技能</option>
                    {attackSkills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
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
