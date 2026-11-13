/**
 * 競技場場內 HUD（`55-arena.md` § 55.2／§ 55.3／§ 55.7）：波次、剩餘怪物、經過時間、本場票券。
 * 數值來自 server 寫回的 `gameStore.arenaRun`。
 */
import { useGameStore } from '../stores/gameStore';
import { ARENA_BOSS_WAVE_INTERVAL, ARENA_MAX_WAVE, isBossWave } from '../models/arena';

export function formatArenaTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ArenaHud() {
  const run = useGameStore(s => s.arenaRun);
  if (!run) return null;
  const boss = isBossWave(run.wave);
  const nextBoss = Math.ceil(run.wave / ARENA_BOSS_WAVE_INTERVAL) * ARENA_BOSS_WAVE_INTERVAL;
  return (
    <div className="arena-hud" data-testid="arena-hud">
      <div className="arena-hud-title">T{run.tier} 競技場{run.ticketRun ? '' : '（不給票券）'}</div>
      <div className="arena-hud-row"><span>波次</span><b className={boss ? 'arena-hud-boss' : ''}>{run.wave} / {ARENA_MAX_WAVE}{boss ? '（王波）' : ''}</b></div>
      {!boss && <div className="arena-hud-row"><span>下一輪王</span><b>第 {nextBoss} 波</b></div>}
      <div className="arena-hud-row"><span>剩餘怪物</span><b>{run.monstersLeft}</b></div>
      <div className="arena-hud-row"><span>經過時間</span><b>{formatArenaTime(run.elapsedMs)}</b></div>
      {run.ticketRun && <div className="arena-hud-row"><span>本場票券</span><b>{run.tickets} 張</b></div>}
    </div>
  );
}
