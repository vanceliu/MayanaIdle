import { useGameStore } from '../stores/gameStore';
import { useMapControlStore } from '../stores/mapControlStore';
import { ARENA_REGION_ID } from '../models/arena';
import { useAreaElapsed, formatElapsed } from '../hooks/useAreaElapsed';
import { calculatePressure, getNextPressureKills } from '../systems/pressure';

/** Pressure 的滑鼠提示：`累積擊殺數/下一級所需擊殺數`；倍率 0 時只有擊殺數（`26-spawn-pressure.md` § 26.3） */
export function formatPressureTitle(areaKills: number, next: number | null): string {
  return next == null ? areaKills.toLocaleString() : `${areaKills.toLocaleString()}/${next.toLocaleString()}`;
}

/**
 * 探索控制列（自動/手動搜尋、Pressure、探索/戰鬥指示、停留時間、戰鬥後等待橫幅、死亡橫幅）
 * 位於頂部 HUD，與地圖選擇器同一列（16-tech-frontend-architecture.md § 32.3）。
 */
export function ExploreBar() {
  const phase = useGameStore(s => s.phase);
  const searchMode = useGameStore(s => s.searchMode);
  const setSearchMode = useGameStore(s => s.setSearchMode);
  const elapsedMs = useAreaElapsed();
  const areaKills = useGameStore(s => s.character?.areaKills ?? 0);
  const pressureRate = useGameStore(s => s.pressureRate);
  const pressureMembers = useGameStore(s => s.pressureMembers);
  const { pressure } = calculatePressure(areaKills, pressureRate, pressureMembers);
  const paused = useMapControlStore(s => s.paused);
  const inArena = useGameStore(s => s.character?.currentRegion === ARENA_REGION_ID);
  // 戰鬥後等待（`03-combat.md` § 戰鬥後等待）；競技場不觸發
  const waiting = paused && !inArena && phase !== 'dead';

  /*
   * 只有模式切換，沒有「搜尋」按鈕：遭遇改由地圖紅點碰撞觸發
   * （`38-map-control.md` § 搜尋模式對應），手動搜尋＝玩家自己點格子移動。
   * 舊的「搜尋／取消搜尋」按鈕早就按了不會有任何事，已移除。
   */
  return (
    <div className="battle-top-bar">
      {waiting && (
        <div className={`wait-banner${phase === 'combat' ? ' is-interrupted' : ''}`} role="status">
          {phase === 'combat' ? '⚔ 等待被打斷，戰鬥中' : '⏸ 戰鬥後等待中'}
        </div>
      )}
      <div className="explore-bar">
        <div className="search-mode-toggle">
          <button className={searchMode === 'auto' ? 'active' : ''} onClick={() => setSearchMode('auto')}>自動搜尋</button>
          <button className={searchMode === 'manual' ? 'active' : ''} onClick={() => setSearchMode('manual')}>手動搜尋</button>
        </div>
        <span className="pressure-badge" title={formatPressureTitle(areaKills, getNextPressureKills(pressure, pressureRate, pressureMembers))}>
          P{pressure}
        </span>
        {searchMode === 'auto' && phase === 'explore' && !waiting && (
          <span className="explore-indicator">探索中...</span>
        )}
        {phase === 'combat' && (
          <span className="explore-indicator combat-indicator">戰鬥中</span>
        )}
        {elapsedMs != null && (
          <span className="area-elapsed" title="待在這張地圖的時間">
            {formatElapsed(elapsedMs)}
          </span>
        )}
      </div>

      {phase === 'dead' && (
        <div className="death-banner">你倒下了 — 已傳送至最近城鎮</div>
      )}
    </div>
  );
}
