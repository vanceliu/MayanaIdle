/**
 * 遊戲時鐘：定時重置一律以固定的 UTC+8 計算，與 server、client 的時區無關
 * （競技場票券場 `55-arena.md` § 55.4、懸賞更新 `53-bounty-contract.md` § 53.4）。
 */
export const GAME_UTC_OFFSET_MINUTES = 8 * 60;

const SHIFT_MS = GAME_UTC_OFFSET_MINUTES * 60_000;

/** 不晚於 `now`、遊戲時間落在 `hours`（升冪整點）的最近時刻（毫秒） */
export function latestGameHourAt(now: number, hours: readonly number[]): number {
  const d = new Date(now + SHIFT_MS);
  const hour = [...hours].reverse().find(h => h <= d.getUTCHours());
  if (hour === undefined) {
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(hours[hours.length - 1], 0, 0, 0);
  } else {
    d.setUTCHours(hour, 0, 0, 0);
  }
  return d.getTime() - SHIFT_MS;
}

/** `now` 之後、遊戲時間落在 `hours`（升冪整點）的下一個時刻（毫秒） */
export function nextGameHourAt(now: number, hours: readonly number[]): number {
  const d = new Date(now + SHIFT_MS);
  const hour = hours.find(h => h > d.getUTCHours());
  if (hour === undefined) {
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(hours[0], 0, 0, 0);
  } else {
    d.setUTCHours(hour, 0, 0, 0);
  }
  return d.getTime() - SHIFT_MS;
}

/** 時刻在遊戲時間的「HH:MM」 */
export function formatGameTime(ms: number): string {
  const d = new Date(ms + SHIFT_MS);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** 遊戲時間每 `slotMinutes` 分鐘一格的格序號；格界 = 遊戲時間分鐘數整除 `slotMinutes` 且秒為 0 的時刻 */
export function gameSlotIndex(ms: number, slotMinutes: number): number {
  return Math.floor((ms + SHIFT_MS) / (slotMinutes * 60_000));
}

/** `(prevMs, nowMs]` 之間是否跨過遊戲時間的 `slotMinutes` 分鐘格界 */
export function crossedGameSlot(prevMs: number, nowMs: number, slotMinutes: number): boolean {
  return gameSlotIndex(nowMs, slotMinutes) > gameSlotIndex(prevMs, slotMinutes);
}
