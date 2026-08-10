/**
 * 試驗場的場內介面（`50-training-ground.md` § 50.4~§ 50.5）。
 *
 * 分成兩塊：
 * - **設定面板**（modal）：木樁參數與召喚。由管理員 NPC 或快捷鈕開啟。
 * - **數據卡**（常駐 HUD）：計時／DPS／命中率／總傷害／MP 淨消耗，
 *   以及開始／停止。量測時要一邊打一邊看數字，這塊不能藏在 modal 裡。
 */
import { useEffect, useState } from 'react';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../stores/gameStore';
import { useTownStore } from '../stores/townStore';
import { useMapMonsterStore } from '../stores/mapMonsterStore';
import { useMapControlStore } from '../stores/mapControlStore';
import { useWindowLayerStore, useWindowZIndex } from '../stores/windowLayerStore';
import { canRestore, getReadout, useTrainingGroundStore } from '../stores/trainingGroundStore';
import { getNearestTown, getRegion } from '../models/mapData';
import { isWalkableTile } from '../models/mapControl';
import type { ElementType, MonsterSize } from '../models/monster';
import {
  DEFENSE_OVERFLOW_THRESHOLD,
  DUMMY_COUNT_MAX,
  DUMMY_DEFENSE_MAX,
  DUMMY_HP_MAX,
  DUMMY_LEVEL_MAX,
  DUMMY_SLOTS,
  getDefenseOverflowDodge,
} from '../models/trainingGround';

const SIZE_OPTIONS: { value: MonsterSize; label: string }[] = [
  { value: 'small', label: '小怪' },
  { value: 'large', label: '大怪' },
];

const ELEMENT_OPTIONS: { value: ElementType; label: string }[] = [
  { value: 'none', label: '無' },
  { value: 'fire', label: '火' },
  { value: 'ice', label: '冰' },
  { value: 'wind', label: '風' },
  { value: 'earth', label: '地' },
  { value: 'light', label: '光' },
  { value: 'dark', label: '暗' },
];

/** 量測進行中每 100ms 重繪一次；停止後不再排程 */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function TrainingGroundView() {
  const char = useGameStore(s => s.character);
  const gear = useGameStore(s => s.equippedGear);
  const navigateTo = useGameStore(s => s.navigateTo);
  const facility = useTownStore(s => s.facility);
  const openFacility = useTownStore(s => s.openFacility);
  const closeFacility = useTownStore(s => s.closeFacility);

  const spec = useTrainingGroundStore(s => s.spec);
  const count = useTrainingGroundStore(s => s.count);
  const measurement = useTrainingGroundStore(s => s.measurement);
  const setSpec = useTrainingGroundStore(s => s.setSpec);
  const setCount = useTrainingGroundStore(s => s.setCount);
  const returnRegionId = useTrainingGroundStore(s => s.returnRegionId);

  const zIndex = useWindowZIndex('town');
  const focusWindow = useWindowLayerStore(s => s.focusWindow);
  const now = useTicker(measurement.running);

  if (!char) return null;

  const readout = getReadout(measurement, char.mp, now);
  const overflowDodge = getDefenseOverflowDodge(spec.defense);
  const infiniteHp = spec.hp === null;

  function summon() {
    const map = useMapControlStore.getState().currentMap;
    if (!map) return;
    // 重新召喚等同結束上一輪量測（§ 50.5.1）
    useTrainingGroundStore.getState().stopIfRunning();
    const positions = DUMMY_SLOTS
      .filter(slot => isWalkableTile(map, slot))
      .slice(0, count);
    useMapMonsterStore.getState().summonDummies(spec, positions);
  }

  function leave() {
    useTrainingGroundStore.getState().stopIfRunning();
    useMapMonsterStore.getState().clearAll();
    closeFacility();
    // 來源遺失（例如重整過）就退回最近的城鎮，不能把玩家留在試驗場（§ 50.2）
    const target = (returnRegionId ? getRegion(returnRegionId) : null)
      ?? getNearestTown(char!.currentRegion);
    navigateTo({ zoneId: target.zoneId, regionId: target.id, floor: null });
  }

  /**
   * 補滿 HP/MP（§ 50.5.3）。免費、瞬間、不進統計 ——
   * 試驗場是工具，「為了再測一次先回城住旅館」是純粹的摩擦。
   */
  function restoreFull() {
    if (!char || !canRestore(useTrainingGroundStore.getState().measurement)) return;
    useGameStore.setState({
      character: { ...char, hp: getEffectiveMaxHp(char, gear), mp: getEffectiveMaxMp(char, gear) },
    });
    useGameStore.getState().saveState();
  }

  function toggleMeasurement() {
    const store = useTrainingGroundStore.getState();
    if (store.measurement.running) store.stop();
    else store.start(char!.mp);
  }

  return (
    <div className="training-view" style={{ zIndex }} onPointerDown={() => focusWindow('town')}>
      <div className="town-npc-bar">
        <button
          className={`town-npc-btn ${facility === 'training-dummy' ? 'active' : ''}`}
          onClick={() => (facility === 'training-dummy' ? closeFacility() : openFacility('training-dummy'))}
          title="木樁設定"
        >
          <span className="npc-icon">🎯</span>
          <span className="npc-label">木樁設定</span>
        </button>
        <button className="town-npc-btn" onClick={leave} title="離開試驗場">
          <span className="npc-icon">🚪</span>
          <span className="npc-label">離開試驗場</span>
        </button>
      </div>

      <div className="training-readout">
        <div className="training-readout-head">
          <span>量測</span>
          <button className="training-measure-btn" onClick={toggleMeasurement}>
            {measurement.running ? '停止' : '開始'}
          </button>
        </div>
        <dl className="training-readout-grid">
          <dt>計時</dt><dd>{readout.elapsedSeconds.toFixed(1)}s</dd>
          <dt>DPS</dt><dd>{readout.dps.toFixed(1)}</dd>
          <dt>總傷害</dt><dd>{readout.totalDamage.toLocaleString()}</dd>
          <dt>命中率</dt>
          <dd>{readout.hitRate === null ? '—' : `${readout.hitRate.toFixed(1)}%`}</dd>
          <dt>MP/秒</dt>
          <dd>{readout.mpPerSecond === null ? '—' : readout.mpPerSecond.toFixed(1)}</dd>
        </dl>
        <p className="training-hint">建議量測 30 秒以上，短時間會低估 DPS。</p>
      </div>

      {facility === 'training-dummy' && (
        <div className="town-modal-overlay" onClick={closeFacility}>
          <div className="town-modal" onClick={e => e.stopPropagation()}>
            <div className="town-modal-header">
              <span>木樁設定</span>
              <button className="town-modal-close" onClick={closeFacility}>✕</button>
            </div>
            <div className="town-modal-body">
              <div className="panel-scroll training-config">
                <label className="training-field">
                  <span>防禦</span>
                  <input
                    type="number" min={0} max={DUMMY_DEFENSE_MAX} value={spec.defense}
                    onChange={e => setSpec({ defense: Number(e.target.value) })}
                  />
                </label>
                {overflowDodge > 0 && (
                  <p className="training-warning">
                    防禦超過 {DEFENSE_OVERFLOW_THRESHOLD} 的部分會轉成迴避：
                    這隻木樁有 {overflowDodge}% 迴避率，命中率會因此下降。
                  </p>
                )}

                <label className="training-field">
                  <span>血量</span>
                  <input
                    type="number" min={1} max={DUMMY_HP_MAX}
                    value={infiniteHp ? '' : spec.hp ?? ''}
                    disabled={infiniteHp}
                    placeholder="無限"
                    onChange={e => setSpec({ hp: Number(e.target.value) })}
                  />
                </label>
                <label className="training-checkbox">
                  <input
                    type="checkbox" checked={infiniteHp}
                    onChange={e => setSpec({ hp: e.target.checked ? null : 10000 })}
                  />
                  <span>無限血量（木樁不會死，量測由「停止」結束）</span>
                </label>

                <label className="training-field">
                  <span>等級</span>
                  <input
                    type="number" min={1} max={DUMMY_LEVEL_MAX} value={spec.level}
                    onChange={e => setSpec({ level: Number(e.target.value) })}
                  />
                </label>

                <label className="training-field">
                  <span>體型</span>
                  <select value={spec.size} onChange={e => setSpec({ size: e.target.value as MonsterSize })}>
                    {SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>

                <label className="training-field">
                  <span>元素</span>
                  <select value={spec.element} onChange={e => setSpec({ element: e.target.value as ElementType })}>
                    {ELEMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>

                <label className="training-field">
                  <span>數量</span>
                  <input
                    type="number" min={1} max={DUMMY_COUNT_MAX} value={count}
                    onChange={e => setCount(Number(e.target.value))}
                  />
                </label>

                <button className="inn-btn" onClick={summon}>召喚木樁</button>
                <button className="inn-btn" onClick={restoreFull} disabled={measurement.running}>
                  回復滿血滿魔（免費）
                </button>
                <p className="training-hint">
                  {measurement.running
                    ? '量測中不能回復 —— 中途補 MP 會讓「MP/秒」變成負數。先按停止。'
                    : '木樁不會移動也不會攻擊，且不掉落物品、不給經驗與金幣。'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
