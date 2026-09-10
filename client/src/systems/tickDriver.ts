/**
 * 固定步長模擬（`97-selfhosted-server.md` § 97.6）：每 `TICK_MS` 跑一次模擬步，
 * 渲染端以 `alpha()` 在前一 tick 與本 tick 的位置之間插值。
 */
import { TICK_MS } from '../core/clock';

/** 單幀最多補跑的 tick 數；超過即丟棄累積，避免分頁切回後連跑數百步 */
export const MAX_CATCHUP_TICKS = 5;

export interface TickDriver {
  /** 餵入一幀的實際經過時間；回傳這一幀跑了幾個 tick */
  frame(deltaMs: number): number;
  /** 0~1，累積未滿一 tick 的比例 */
  alpha(): number;
  /** 手動跑一個 tick（測試與 server 迴圈用） */
  step(): void;
  reset(): void;
}

export function createTickDriver(step: (tickMs: number) => void, tickMs = TICK_MS): TickDriver {
  let acc = 0;
  return {
    frame(deltaMs) {
      acc += deltaMs;
      let ran = 0;
      while (acc >= tickMs && ran < MAX_CATCHUP_TICKS) {
        step(tickMs);
        acc -= tickMs;
        ran++;
      }
      if (ran === MAX_CATCHUP_TICKS && acc >= tickMs) acc = 0;
      return ran;
    },
    alpha() {
      return Math.min(1, acc / tickMs);
    },
    step() {
      step(tickMs);
    },
    reset() {
      acc = 0;
    },
  };
}

export interface Lerpable { x: number; y: number }

export function lerpPosition(prev: Lerpable | undefined, cur: Lerpable, alpha: number): Lerpable {
  if (!prev || alpha >= 1) return cur;
  return { x: prev.x + (cur.x - prev.x) * alpha, y: prev.y + (cur.y - prev.y) * alpha };
}
