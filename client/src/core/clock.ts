/**
 * 遊戲時間（`97-selfhosted-server.md` § 97.6）：以 tick 計數表示，不依賴 `Date.now()`。
 * 遊戲迴圈以 `advanceMs` 推進；wall clock 只用於離線時長、建立時間等非判定用途。
 */
export const TICK_MS = 300;

let elapsedMs = 0;
let source: () => number = () => elapsedMs;

/** 遊戲時間（ms） */
export function gameNow(): number {
  return source();
}

/** 目前 tick 序號 */
export function currentTick(): number {
  return Math.floor(gameNow() / TICK_MS);
}

export function advanceMs(deltaMs: number): void {
  elapsedMs += deltaMs;
}

export function advanceTicks(n = 1): void {
  elapsedMs += n * TICK_MS;
}

export function setGameNow(ms: number): void {
  elapsedMs = ms;
}

/** 測試與 client 顯示層的注入點 */
export function setClockSource(next: (() => number) | null): void {
  source = next ?? (() => elapsedMs);
}
