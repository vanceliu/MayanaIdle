import { useGameStore, selectEmergencyRetreat, type AfterCombatThresholdKey } from '../stores/gameStore';
import { ALL_TOWN_SCROLLS } from '../models/townScroll';
import type { EmergencyRetreat } from '../models/scriptEngine';
import { useLatestSent } from '../hooks/useLatestSent';
import { DraftNumberInput } from './DraftNumberInput';

/**
 * 常駐天賦分頁底下的兩組設定（`03-combat.md` § 3.13）。
 *
 * 緊急撤退與戰鬥後等待**不是天賦規則**：不佔天賦格、不吃鑲材、不參與由上往下的判定。
 * 它們是常駐行為的門檻設定，所以放在常駐分頁的天賦列下方。
 */
export function PersistentSettings() {
  const activeTemplateId = useGameStore(s => s.activeTemplateId);
  const setEmergencyRetreat = useGameStore(s => s.setEmergencyRetreat);
  // 整份覆寫：連續修改以本機最後送出的設定為基準（`97-selfhosted-server.md` § 97.2）
  const retreat = useLatestSent(useGameStore(selectEmergencyRetreat), activeTemplateId);
  const emergencyRetreat = retreat.latest();
  const writeRetreat = (patch: Partial<EmergencyRetreat>) =>
    retreat.send({ ...retreat.latest(), ...patch }, setEmergencyRetreat);
  const afterCombatHpThreshold = useGameStore(s => s.afterCombatHpThreshold);
  const afterCombatMpThreshold = useGameStore(s => s.afterCombatMpThreshold);
  const afterCombatHpResumeThreshold = useGameStore(s => s.afterCombatHpResumeThreshold);
  const afterCombatMpResumeThreshold = useGameStore(s => s.afterCombatMpResumeThreshold);

  // 門檻存在角色偏好裡、由（線上模式下跑在 server 的）迴圈讀取，所以要走 store action
  const setThreshold = useGameStore(s => s.setAfterCombatThreshold);

  function writeThreshold(key: AfterCombatThresholdKey, value: number | undefined) {
    if (value === undefined) return;
    return setThreshold(key, value);
  }

  return (
    <div className="talent-settings">
      <section className="talent-setting-block">
        <h4 className="talent-setting-title">緊急撤退（僅戰鬥中生效）</h4>
        <div className="talent-setting-row">
          <input
            type="checkbox"
            checked={emergencyRetreat.enabled}
            onChange={e => writeRetreat({ enabled: e.target.checked })}
          />
          <label>HP 低於</label>
          <DraftNumberInput
            aria-label="緊急撤退 HP 門檻"
            min={1}
            max={100}
            value={emergencyRetreat.hpThreshold}
            onCommit={v => v !== undefined && writeRetreat({ hpThreshold: v })}
          />
          <span>%</span>
          <span className="talent-setting-fixed">→ 回城</span>
          {emergencyRetreat.action === 'flee_town' && (
            <select
              value={emergencyRetreat.scrollTownId ?? ''}
              onChange={e => writeRetreat({ scrollTownId: e.target.value || undefined })}
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
          <DraftNumberInput
            min={0} max={100} value={afterCombatHpThreshold}
            onCommit={v => writeThreshold('afterCombatHpThreshold', v)}
          />
          <span>%</span>
          <label>MP ≤</label>
          <DraftNumberInput
            min={0} max={100} value={afterCombatMpThreshold}
            onCommit={v => writeThreshold('afterCombatMpThreshold', v)}
          />
          <span>% 時停下休息</span>
        </div>
        <div className="talent-setting-row">
          <label>HP ≥</label>
          <DraftNumberInput
            min={0} max={100} value={afterCombatHpResumeThreshold}
            onCommit={v => writeThreshold('afterCombatHpResumeThreshold', v)}
          />
          <span>%</span>
          <label>MP ≥</label>
          <DraftNumberInput
            min={0} max={100} value={afterCombatMpResumeThreshold}
            onCommit={v => writeThreshold('afterCombatMpResumeThreshold', v)}
          />
          <span>% 時恢復行動</span>
        </div>
      </section>
    </div>
  );
}
