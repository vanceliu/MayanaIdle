import { useGameStore } from '../stores/gameStore';
import type { ScriptRule, ConditionType, ActionType, ScriptCondition, ScriptAction } from '../models/scriptEngine';
import type { PotionType } from '../stores/gameStore';
import { ALL_TOWN_SCROLLS } from '../models/townScroll';

const CONDITION_LABELS: Record<ConditionType, string> = {
  always: '永遠',
  hp_below: 'HP 低於',
  hp_above: 'HP 高於',
  mp_below: 'MP 低於',
  mp_above: 'MP 高於',
  monster_count_gte: '怪物數量 ≥',
  monster_hp_below: '怪物 HP 低於',
  skill_ready: '技能就緒',
};

const ACTION_LABELS: Record<ActionType, string> = {
  skill: '施放技能',
  potion: '使用藥水',
  flee_town: '回城',
  flee_teleport: '瞬移逃跑',
  normal_attack: '普通攻擊',
};

const POTION_LABELS: Record<PotionType, string> = {
  red: '紅色藥水',
  orange: '橙色藥水',
  white: '白色藥水',
};

export function ScriptEditor() {
  const scriptRules = useGameStore(s => s.scriptRules);
  const skills = useGameStore(s => s.skills);
  const setScriptRules = useGameStore(s => s.setScriptRules);
  const afterCombatHpThreshold = useGameStore(s => s.afterCombatHpThreshold);
  const afterCombatMpThreshold = useGameStore(s => s.afterCombatMpThreshold);

  function updateRule(idx: number, updates: Partial<ScriptRule>) {
    const rules = [...scriptRules];
    rules[idx] = { ...rules[idx], ...updates };
    setScriptRules(rules);
  }

  function updateCondition(idx: number, updates: Partial<ScriptCondition>) {
    const rules = [...scriptRules];
    rules[idx] = { ...rules[idx], condition: { ...rules[idx].condition, ...updates } };
    setScriptRules(rules);
  }

  function updateAction(idx: number, updates: Partial<ScriptAction>) {
    const rules = [...scriptRules];
    rules[idx] = { ...rules[idx], action: { ...rules[idx].action, ...updates } };
    setScriptRules(rules);
  }

  function moveRule(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= scriptRules.length) return;
    const rules = [...scriptRules];
    [rules[idx], rules[newIdx]] = [rules[newIdx], rules[idx]];
    setScriptRules(rules);
  }

  function addRule() {
    const newRule: ScriptRule = {
      id: `rule-${Date.now()}`,
      enabled: true,
      condition: { type: 'always' },
      action: { type: 'normal_attack' },
    };
    setScriptRules([...scriptRules, newRule]);
  }

  function removeRule(idx: number) {
    const rules = scriptRules.filter((_, i) => i !== idx);
    setScriptRules(rules);
  }

  const needsValue = (type: ConditionType) =>
    ['hp_below', 'hp_above', 'mp_below', 'mp_above', 'monster_count_gte', 'monster_hp_below'].includes(type);

  return (
    <div className="script-editor-content">
      <p className="script-hint">由上往下判定，第一個符合條件的規則會被執行</p>

      <div className="script-rules">
        {scriptRules.map((rule, idx) => (
          <div key={rule.id} className={`script-rule ${rule.enabled ? '' : 'disabled'}`}>
            <div className="rule-header">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={e => updateRule(idx, { enabled: e.target.checked })}
              />
              <span className="rule-num">#{idx + 1}</span>
              <button onClick={() => moveRule(idx, -1)} disabled={idx === 0}>▲</button>
              <button onClick={() => moveRule(idx, 1)} disabled={idx === scriptRules.length - 1}>▼</button>
              <button className="btn-remove" onClick={() => removeRule(idx)}>✕</button>
            </div>
            <div className="rule-body">
              <div className="rule-condition">
                <span>如果</span>
                <select
                  value={rule.condition.type}
                  onChange={e => updateCondition(idx, { type: e.target.value as ConditionType })}
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
                    {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
              <div className="rule-action">
                <span>→</span>
                <select
                  value={rule.action.type}
                  onChange={e => updateAction(idx, { type: e.target.value as ActionType })}
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
                    {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {rule.action.type === 'potion' && (
                  <select
                    value={rule.action.potionType ?? 'red'}
                    onChange={e => updateAction(idx, { potionType: e.target.value as PotionType })}
                  >
                    {Object.entries(POTION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                )}
                {rule.action.type === 'flee_town' && (
                  <select
                    value={rule.action.scrollTownId ?? ''}
                    onChange={e => updateAction(idx, { scrollTownId: e.target.value || undefined })}
                  >
                    <option value="">任意卷軸</option>
                    {ALL_TOWN_SCROLLS.map(s => (
                      <option key={s.townId} value={s.townId}>{s.townName}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn-add-rule" onClick={addRule}>+ 新增規則</button>

      <div className="script-section" style={{ marginTop: 12 }}>
        <div className="script-label">戰鬥後等待</div>
        <div className="script-row">
          <label>HP ≤</label>
          <input
            type="number"
            min={0}
            max={100}
            value={afterCombatHpThreshold}
            onChange={e => useGameStore.setState({ afterCombatHpThreshold: Number(e.target.value) })}
          />
          <span>%</span>
        </div>
        <div className="script-row">
          <label>MP ≤</label>
          <input
            type="number"
            min={0}
            max={100}
            value={afterCombatMpThreshold}
            onChange={e => useGameStore.setState({ afterCombatMpThreshold: Number(e.target.value) })}
          />
          <span>%</span>
        </div>
      </div>
    </div>
  );
}
