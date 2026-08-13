import { useGameStore, selectEmergencyRetreat } from '../stores/gameStore';
import { ALL_TOWN_SCROLLS } from '../models/townScroll';

/**
 * 常駐天賦分頁底下的兩組設定（`03-combat.md` § 3.13）。
 *
 * 緊急撤退與戰鬥後等待**不是天賦規則**：不佔天賦格、不吃鑲材、不參與由上往下的判定。
 * 它們是常駐行為的門檻設定，所以放在常駐分頁的天賦列下方。
 */
export function PersistentSettings() {
  const emergencyRetreat = useGameStore(selectEmergencyRetreat);
  const setEmergencyRetreat = useGameStore(s => s.setEmergencyRetreat);
  const afterCombatHpThreshold = useGameStore(s => s.afterCombatHpThreshold);
  const afterCombatMpThreshold = useGameStore(s => s.afterCombatMpThreshold);
  const afterCombatHpResumeThreshold = useGameStore(s => s.afterCombatHpResumeThreshold);
  const afterCombatMpResumeThreshold = useGameStore(s => s.afterCombatMpResumeThreshold);

  function writeThreshold(key: string, value: number) {
    useGameStore.setState({ [key]: value } as never);
    useGameStore.getState().saveState();
  }

  return (
    <div className="talent-settings">
      <section className="talent-setting-block">
        <h4 className="talent-setting-title">緊急撤退（僅戰鬥中生效）</h4>
        <div className="talent-setting-row">
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
          <span className="talent-setting-fixed">→ 回城</span>
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
      </section>

      <section className="talent-setting-block">
        <h4 className="talent-setting-title">戰鬥後等待</h4>
        <div className="talent-setting-row">
          <label>HP ≤</label>
          <input
            type="number" min={0} max={100} value={afterCombatHpThreshold}
            onChange={e => writeThreshold('afterCombatHpThreshold', Number(e.target.value))}
          />
          <span>%</span>
          <label>MP ≤</label>
          <input
            type="number" min={0} max={100} value={afterCombatMpThreshold}
            onChange={e => writeThreshold('afterCombatMpThreshold', Number(e.target.value))}
          />
          <span>% 時停下休息</span>
        </div>
        <div className="talent-setting-row">
          <label>HP ≥</label>
          <input
            type="number" min={0} max={100} value={afterCombatHpResumeThreshold}
            onChange={e => writeThreshold('afterCombatHpResumeThreshold', Number(e.target.value))}
          />
          <span>%</span>
          <label>MP ≥</label>
          <input
            type="number" min={0} max={100} value={afterCombatMpResumeThreshold}
            onChange={e => writeThreshold('afterCombatMpResumeThreshold', Number(e.target.value))}
          />
          <span>% 時恢復行動</span>
        </div>
      </section>
    </div>
  );
}
