import { describe, it, expect, vi } from 'vitest';
import { buildSnapshot, createCachedLeaderboard, LEADERBOARD_CACHE_MS, type Row } from '../leaderboard';
import { normalizeStatistics } from '../../../client/src/models/statistics';

/** 排行榜全服共用快照（`97-selfhosted-server.md` § 97.4） */
function rows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    uuid: `u${String(i).padStart(3, '0')}`,
    name: `P${i}`,
    className: 'knight',
    level: i + 1,
    stats: normalizeStatistics({ monstersKilled: n - i }),
    contribution: i * 10,
  }));
}

function setup() {
  let now = 1_000_000;
  const data = rows(30);
  const load = vi.fn(() => data);
  const leaderboard = createCachedLeaderboard(load, () => now);
  return { load, leaderboard, data, advance: (ms: number) => { now += ms; } };
}

describe('排行榜快取', () => {
  it(`快取 ${LEADERBOARD_CACHE_MS / 1000} 秒`, () => {
    expect(LEADERBOARD_CACHE_MS).toBe(60_000);
  });

  it('有效期內多次請求只讀表一次，同一 top 回同一份快照', () => {
    const { load, leaderboard } = setup();

    const first = leaderboard(20);
    for (let i = 0; i < 50; i++) leaderboard(20);

    expect(load).toHaveBeenCalledTimes(1);
    expect(leaderboard(20)).toBe(first);
  });

  it('不同 top 共用同一次讀表，各自算一次', () => {
    const { load, leaderboard } = setup();

    const top5 = leaderboard(5);
    const top20 = leaderboard(20);

    expect(load).toHaveBeenCalledTimes(1);
    expect(top5.top).toBe(5);
    expect(top20.top).toBe(20);
    expect(leaderboard(5)).toBe(top5);
  });

  it('過期後重新讀表', () => {
    const { load, leaderboard, advance } = setup();
    const first = leaderboard(20);

    advance(LEADERBOARD_CACHE_MS - 1);
    expect(leaderboard(20)).toBe(first);
    advance(1);
    const second = leaderboard(20);

    expect(load).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it('內容與即時計算相同；top 夾在 1~100', () => {
    const { leaderboard, data } = setup();

    expect(leaderboard(20)).toEqual(buildSnapshot(data, 20));
    expect(leaderboard(0).top).toBe(1);
    expect(leaderboard(999).top).toBe(100);
  });
});
