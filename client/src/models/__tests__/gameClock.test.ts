import { afterEach, describe, expect, it } from 'vitest';
import { formatGameTime, GAME_UTC_OFFSET_MINUTES, latestGameHourAt, nextGameHourAt } from '../gameClock';

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
/** 遊戲時間（UTC+8）2026-11-20 h:m */
const at = (h: number, m = 0) => Date.UTC(2026, 10, 20, h - 8, m);

describe('遊戲時鐘固定 UTC+8', () => {
  const originalTz = process.env.TZ;
  afterEach(() => { process.env.TZ = originalTz; });

  it('偏移為 +8 小時', () => {
    expect(GAME_UTC_OFFSET_MINUTES).toBe(480);
  });

  it('最近與下一個整點以遊戲時間判定', () => {
    expect(latestGameHourAt(at(4, 59), HOURS)).toBe(at(3));
    expect(nextGameHourAt(at(4, 59), HOURS)).toBe(at(6));
    expect(nextGameHourAt(at(21), HOURS)).toBe(at(24));
  });

  it('跨日：清單第一個整點之前退回前一天的最後一個', () => {
    expect(latestGameHourAt(at(5), [6, 18])).toBe(at(-6));
  });

  it('結果與執行環境的時區無關（server 為 UTC、client 為台灣時間時一致）', () => {
    const now = at(10, 15);
    const results = ['UTC', 'Asia/Taipei', 'America/New_York'].map(tz => {
      process.env.TZ = tz;
      return [latestGameHourAt(now, HOURS), nextGameHourAt(now, HOURS), formatGameTime(nextGameHourAt(now, HOURS))];
    });
    expect(results).toEqual([[at(9), at(12), '12:00'], [at(9), at(12), '12:00'], [at(9), at(12), '12:00']]);
  });
});
