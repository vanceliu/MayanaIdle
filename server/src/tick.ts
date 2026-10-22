/**
 * 300ms 全服 tick（`97-selfhosted-server.md` § 97.3、§ 97.6）：時鐘推進一次，
 * 每實例與每玩家的兩層由 `World.tick` 推進，再逐 session 推送一則 `frame`（§ 97.2「狀態同步」）。
 * 輸出 tick 耗時監控（平均／p99／超時次數）。
 */
import { TICK_MS } from '../../client/src/core/clock';
import { syncWorld, type PlayerSession } from './playerSession';
import { buildFrame } from './sync';
import type { World } from './world';
import { log } from './log';

export interface TickStats {
  samples: number;
  avgMs: number;
  p99Ms: number;
  overruns: number;
  lastMs: number;
}

const WINDOW = 200;

export class TickLoop {
  private readonly world: World;
  private timer: NodeJS.Timeout | null = null;
  private durations: number[] = [];
  private overruns = 0;
  private running = false;

  constructor(world: World) {
    this.world = world;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  stats(): TickStats {
    const d = [...this.durations].sort((a, b) => a - b);
    const avg = d.length ? d.reduce((s, x) => s + x, 0) / d.length : 0;
    const p99 = d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.99))] : 0;
    return { samples: d.length, avgMs: Math.round(avg * 100) / 100, p99Ms: Math.round(p99 * 100) / 100, overruns: this.overruns, lastMs: this.durations[this.durations.length - 1] ?? 0 };
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.overruns++;
      return;
    }
    this.running = true;
    const t0 = performance.now();
    try {
      for (const session of this.world.sessions) void syncWorld(session);
      const visuals = this.world.tick();
      for (const session of this.world.sessions) {
        try {
          flushTick(session, visuals.get(session) ?? []);
        } catch (e) {
          log.error(`flush session #${session.connectionId} failed`, e);
        }
      }
    } catch (e) {
      log.error('tick failed', e);
    } finally {
      const elapsed = performance.now() - t0;
      this.durations.push(elapsed);
      if (this.durations.length > WINDOW) this.durations.shift();
      if (elapsed > TICK_MS) this.overruns++;
      this.running = false;
    }
  }
}

/** 操作回應的推送：只帶 store 變動 */
export function flush(session: PlayerSession): void {
  const frame = buildFrame(session, null);
  if (frame) session.send(frame);
}

/** tick 推送：帶 `now`、怪物戰鬥狀態與演出 */
export function flushTick(session: PlayerSession, visuals: unknown[]): void {
  const frame = buildFrame(session, { visuals });
  if (frame) session.send(frame);
}
