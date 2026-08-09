import { useGameStore, selectPersistentRules, selectEmergencyRetreat } from '../stores/gameStore';
import type { PersistentRule, PersistentConditionType, PersistentActionType, PersistentCondition, PersistentAction, ScriptDebuffCondition } from '../models/scriptEngine';
import { SCRIPT_DEBUFF_LABELS } from '../models/scriptEngine';
import { CURE_ITEMS } from '../models/cureItem';
import { getItemById } from '../models/items';
import type { PotionType, SpeedPotionType } from '../stores/gameStore';
import { ALL_TOWN_SCROLLS } from '../models/townScroll';

const CONDITION_LABELS: Record<PersistentConditionType, string> = {
  always: '永遠',
  hp_below: 'HP 低於',
  hp_above: 'HP 高於',
  mp_below: 'MP 低於',
  mp_above: 'MP 高於',
  buff_not_active: 'Buff 未激活',
  speed_not_active: '加速未激活',
  skill_ready: '技能就緒',
  debuff_active: '狀態異常',
};

const ACTION_LABELS: Record<PersistentActionType, string> = {
  potion: '使用藥水',
  speed_potion: '使用加速藥水',
  buff_skill: '施放 Buff',
  heal_skill: '施放治癒',
  cure_item: '使用解除道具',
};

const POTION_LABELS: Record<PotionType, string> = {
  red: '紅色藥水',
  orange: '橙色藥水',
  white: '白色藥水',
};

const SPEED_POTION_LABELS: Record<SpeedPotionType, string> = {
  green: '綠色藥水',
  'enhanced-green': '強化綠色藥水',
};

const SCRIPT_DEBUFF_CONDITIONS: ScriptDebuffCondition[] = ['poison', 'bleed', 'curse_weaken', 'slow'];

export function PersistentScriptEditor() {
  const persistentRules = useGameStore(selectPersistentRules);
  const skills = useGameStore(s => s.skills);
  const setPersistentRules = useGameStore(s => s.setPersistentRules);
  const emergencyRetreat = useGameStore(selectEmergencyRetreat);
  const setEmergencyRetreat = useGameStore(s => s.setEmergencyRetreat);
  const afterCombatHpThreshold = useGameStore(s => s.afterCombatHpThreshold);
  const afterCombatMpThreshold = useGameStore(s => s.afterCombatMpThreshold);
  const afterCombatHpResumeThreshold = useGameStore(s => s.afterCombatHpResumeThreshold);
  const afterCombatMpResumeThreshold = useGameStore(s => s.afterCombatMpResumeThreshold);

  const buffSkills = skills.filter(s => s.type === 'buff');
  const healSkills = skills.filter(s => s.type === 'heal');

  function updateRule(idx: number, updates: Partial<PersistentRule>) {
    const rules = [...persistentRules];
    rules[idx] = { ...rules[idx], ...updates };
    setPersistentRules(rules);
  }

  function updateCondition(idx: number, condIdx: number, updates: Partial<PersistentCondition>) {
    const rules = [...persistentRules];
    const conditions = rules[idx].conditions.map((c, i) => (i === condIdx ? { ...c, ...updates } : c));
    rules[idx] = { ...rules[idx], conditions };
    setPersistentRules(rules);
  }

  function addCondition(idx: number) {
    const rules = [...persistentRules];
    rules[idx] = { ...rules[idx], conditions: [...rules[idx].conditions, { type: 'always' }] };
    setPersistentRules(rules);
  }

  function removeCondition(idx: number, condIdx: number) {
    const rules = [...persistentRules];
    rules[idx] = { ...rules[idx], conditions: rules[idx].conditions.filter((_, i) => i !== condIdx) };
    setPersistentRules(rules);
  }

  function updateAction(idx: number, updates: Partial<PersistentAction>) {
    const rules = [...persistentRules];
    rules[idx] = { ...rules[idx], action: { ...rules[idx].action, ...updates } };
    setPersistentRules(rules);
  }

  function moveRule(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= persistentRules.length) return;
    const rules = [...persistentRules];
    [rules[idx], rules[newIdx]] = [rules[newIdx], rules[idx]];
    setPersistentRules(rules);
  }

  function addRule() {
    const newRule: PersistentRule = {
      id: `persistent-${Date.now()}`,
      enabled: true,
      conditions: [{ type: 'hp_below', value: 50 }],
      action: { type: 'potion', potionType: 'red' },
    };
    setPersistentRules([...persistentRules, newRule]);
  }

  function removeRule(idx: number) {
    setPersistentRules(persistentRules.filter((_, i) => i !== idx));
  }

  const needsValue = (type: PersistentConditionType) =>
    ['hp_below', 'hp_above', 'mp_below', 'mp_above'].includes(type);

  const needsSkill = (type: PersistentConditionType) =>
    ['buff_not_active', 'skill_ready'].includes(type);

  return (
    <div className="script-editor-content">
      <p className="script-hint">任何狀態下常駐生效（探索、戰鬥皆判定）。</p>

      <div className="script-rules">
        {persistentRules.map((rule, idx) => (
          <div key={rule.id} className={`script-rule ${rule.enabled ? '' : 'disabled'}`}>
            <div className="rule-header">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={e => updateRule(idx, { enabled: e.target.checked })}
              />
              <span className="rule-num">#{idx + 1}</span>
              <button onClick={() => moveRule(idx, -1)} disabled={idx === 0}>▲</button>
              <button onClick={() => moveRule(idx, 1)} disabled={idx === persistentRules.length - 1}>▼</button>
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
                    onChange={e => {
                      const newType = e.target.value as PersistentConditionType;
                      const updates: Partial<PersistentCondition> = { type: newType };
                      if (newType === 'debuff_active' && !cond.debuffType) {
                        updates.debuffType = SCRIPT_DEBUFF_CONDITIONS[0];
                      }
                      updateCondition(idx, condIdx, updates);
                    }}
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
                      <span className="unit-label">%</span>
                    </>
                  )}
                  {needsSkill(cond.type) && (
                    <select
                      value={cond.skillId ?? ''}
                      onChange={e => updateCondition(idx, condIdx, { skillId: e.target.value })}
                    >
                      <option value="">選擇技能</option>
                      {buffSkills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  {cond.type === 'debuff_active' && (
                    <select
                      value={cond.debuffType ?? 'poison'}
                      onChange={e => updateCondition(idx, condIdx, { debuffType: e.target.value as ScriptDebuffCondition })}
                    >
                      {SCRIPT_DEBUFF_CONDITIONS.map(t => (
                        <option key={t} value={t}>{SCRIPT_DEBUFF_LABELS[t]}</option>
                      ))}
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
                  onChange={e => {
                    const newType = e.target.value as PersistentActionType;
                    const defaults: Partial<PersistentAction> = { type: newType };
                    if (newType === 'potion') defaults.potionType = 'red';
                    if (newType === 'speed_potion') defaults.speedPotionType = 'green';
                    if (newType === 'cure_item') defaults.cureItemId = CURE_ITEMS[0].itemId;
                    updateAction(idx, defaults);
                  }}
                >
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
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
                {rule.action.type === 'speed_potion' && (
                  <select
                    value={rule.action.speedPotionType ?? 'green'}
                    onChange={e => updateAction(idx, { speedPotionType: e.target.value as SpeedPotionType })}
                  >
                    {Object.entries(SPEED_POTION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                )}
                {rule.action.type === 'cure_item' && (
                  <select
                    value={rule.action.cureItemId ?? CURE_ITEMS[0].itemId}
                    onChange={e => updateAction(idx, { cureItemId: Number(e.target.value) })}
                  >
                    {CURE_ITEMS.map(c => (
                      <option key={c.itemId} value={c.itemId}>{getItemById(c.itemId)?.name ?? c.name}</option>
                    ))}
                  </select>
                )}
                {rule.action.type === 'buff_skill' && (
                  <select
                    value={rule.action.skillId ?? ''}
                    onChange={e => updateAction(idx, { skillId: e.target.value })}
                  >
                    <option value="">選擇技能</option>
                    {buffSkills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {rule.action.type === 'heal_skill' && (
                  <select
                    value={rule.action.skillId ?? ''}
                    onChange={e => updateAction(idx, { skillId: e.target.value })}
                  >
                    <option value="">選擇技能</option>
                    {healSkills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn-add-rule" onClick={addRule}>+ 新增規則</button>

      <div className="script-section emergency-retreat-section" style={{ marginTop: 16 }}>
        <div className="script-label">緊急撤退（僅戰鬥中生效）</div>
        <div className="script-row">
          <input
            type="checkbox"
            checked={emergencyRetreat.enabled}
            onChange={e => setEmergencyRetreat({ ...emergencyRetreat, enabled: e.target.checked })}
          />
          <label>HP 低於</label>
          <input
            type="number"
            min={1}
            max={100}
            value={emergencyRetreat.hpThreshold}
            onChange={e => setEmergencyRetreat({ ...emergencyRetreat, hpThreshold: Number(e.target.value) })}
          />
          <span>%</span>
        </div>
        <div className="script-row">
          <label>動作</label>
          <span className="retreat-action-fixed">回城</span>
          {emergencyRetreat.action === 'flee_town' && (
            <select
              value={emergencyRetreat.scrollTownId ?? ''}
              onChange={e => setEmergencyRetreat({ ...emergencyRetreat, scrollTownId: e.target.value || undefined })}
            >
              <option value="">任意卷軸</option>
              {ALL_TOWN_SCROLLS.map(s => (
                <option key={s.townId} value={s.townId}>{s.townName}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="script-section" style={{ marginTop: 12 }}>
        <div className="script-label">戰鬥後等待</div>
        <div className="script-row">
          <label>HP ≤</label>
          <input
            type="number"
            min={0}
            max={100}
            value={afterCombatHpThreshold}
            onChange={e => { useGameStore.setState({ afterCombatHpThreshold: Number(e.target.value) }); useGameStore.getState().saveState(); }}
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
            onChange={e => { useGameStore.setState({ afterCombatMpThreshold: Number(e.target.value) }); useGameStore.getState().saveState(); }}
          />
          <span>%</span>
        </div>
        <div className="script-row">
          <label>HP ≥</label>
          <input
            type="number"
            min={0}
            max={100}
            value={afterCombatHpResumeThreshold}
            onChange={e => { useGameStore.setState({ afterCombatHpResumeThreshold: Number(e.target.value) }); useGameStore.getState().saveState(); }}
          />
          <span>% 時恢復行動</span>
        </div>
        <div className="script-row">
          <label>MP ≥</label>
          <input
            type="number"
            min={0}
            max={100}
            value={afterCombatMpResumeThreshold}
            onChange={e => { useGameStore.setState({ afterCombatMpResumeThreshold: Number(e.target.value) }); useGameStore.getState().saveState(); }}
          />
          <span>% 時恢復行動</span>
        </div>
      </div>
    </div>
  );
}
