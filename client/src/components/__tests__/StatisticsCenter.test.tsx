import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { StatisticsCenter, resetLeaderboardCache } from '../town/StatisticsCenter';
import { useGameStore } from '../../stores/gameStore';
import { connection } from '../../net/connection';
import { createDefaultStatistics } from '../../models/statistics';
import type { Character } from '../../models/character';

/**
 * @vitest-environment jsdom
 *
 * 榜單由本服 server 即時計算（`97-selfhosted-server.md` § 97.4）：
 * 整個統計中心只向 server 要一次 snapshot，10 分鐘內不重複請求（`37-statistics.md` § 37.4.4），
 * 各榜由同一份 snapshot 在本地切出。沒有上傳這回事。
 */

const FIELDS = [
  'character_id', 'character_name', 'class_name',
  'character_level', 'monstersKilled', 'bossesKilled', 'deathCount',
  'equipmentCrafted', 'weaponEnhanceAttempts', 'armorEnhanceAttempts',
  'weaponsBroken', 'armorsBroken', 'questsCompleted',
  'totalGoldEarned', 'contribution', 'updated_at',
];

const SNAPSHOT = {
  top: 20,
  count: 2,
  fields: FIELDS,
  rows: [
    ['uuid-other', '別人', 'thief', 30, 500, 5, 2, 0, 0, 0, 0, 0, 0, 1000, 0, '2026-08-01 00:00:00'],
    ['uuid-mine', '我方', 'knight', 20, 900, 1, 0, 0, 0, 0, 0, 0, 0, 200, 0, '2026-08-01 00:00:00'],
  ],
};

const requestLeaderboard = vi.fn(async () => SNAPSHOT);

function setCharacter(uuid: string | undefined = 'uuid-mine') {
  useGameStore.setState({
    character: { id: 1, uuid, userId: 1, name: '我方', className: 'knight', level: 20 } as Character,
    statistics: createDefaultStatistics(),
    guildProgress: { rank: 'F', points: 0 },
  } as never);
}

describe('StatisticsCenter', () => {
  beforeEach(() => {
    localStorage.clear();
    resetLeaderboardCache();
    requestLeaderboard.mockReset().mockResolvedValue(SNAPSHOT);
    vi.spyOn(connection, 'requestLeaderboard').mockImplementation(requestLeaderboard as never);
    setCharacter();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('開啟時只向 server 要一次 snapshot，各榜在本地切出', async () => {
    render(<StatisticsCenter />);

    await waitFor(() => expect(screen.getAllByText('殺敵數').length).toBeGreaterThan(0));

    expect(requestLeaderboard).toHaveBeenCalledTimes(1);
    for (const label of ['等級', '殺敵數', 'BOSS 討伐', '死亡次數', '武器爆掉', '任務貢獻度']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('10 分鐘內重新開啟不再要一次', async () => {
    render(<StatisticsCenter />);
    await waitFor(() => expect(requestLeaderboard).toHaveBeenCalledTimes(1));

    cleanup();
    requestLeaderboard.mockClear();

    render(<StatisticsCenter />);
    await waitFor(() => expect(screen.getAllByText('殺敵數').length).toBeGreaterThan(0));

    expect(requestLeaderboard).not.toHaveBeenCalled();
  });

  it('榜單依各欄位在本地正確排序（同一份 snapshot 切出不同名次）', async () => {
    render(<StatisticsCenter />);
    await waitFor(() => expect(requestLeaderboard).toHaveBeenCalledTimes(1));

    // 殺敵數：我方 900 > 別人 500；等級：別人 30 > 我方 20
    const cards = document.querySelectorAll('.stats-card');
    const levelCard = [...cards].find(c => c.querySelector('.stats-card-title')?.textContent === '等級');
    const killCard = [...cards].find(c => c.querySelector('.stats-card-title')?.textContent === '殺敵數');

    expect(levelCard?.querySelectorAll('.stats-card-name')[0].textContent).toContain('別人');
    expect(killCard?.querySelectorAll('.stats-card-name')[0].textContent).toContain('我方');
  });

  it('server 要不到時顯示錯誤訊息', async () => {
    requestLeaderboard.mockRejectedValue(new Error('offline'));

    render(<StatisticsCenter />);

    await waitFor(() => expect(screen.getByText('無法載入排行榜')).toBeDefined());
  });
});
