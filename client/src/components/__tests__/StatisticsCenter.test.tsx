import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { StatisticsCenter } from '../town/StatisticsCenter';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultStatistics } from '../../models/statistics';
import type { Character } from '../../models/character';

/**
 * @vitest-environment jsdom
 *
 * § 37.4.4：整個統計中心只打一支 GET /api/snapshot，10 分鐘內不重複請求。
 */

vi.mock('../../services/turnstile', () => ({
  getTurnstileToken: vi.fn(async () => 'test-token'),
}));

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

const fetchMock = vi.fn();

function urlOf(call: unknown[]): string {
  return String(call[0]);
}

function snapshotCalls() {
  return fetchMock.mock.calls.filter(c => urlOf(c).includes('/api/snapshot'));
}

function setCharacter(uuid: string | undefined = 'uuid-mine') {
  useGameStore.setState({
    character: { id: 1, uuid, userId: 1, name: '我方', className: 'knight', level: 20 } as Character,
    statistics: createDefaultStatistics(),
    guildProgress: { rank: 'F', points: 0 },
  });
}

describe('StatisticsCenter', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/snapshot')) {
        return { ok: true, status: 200, json: async () => SNAPSHOT };
      }
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    setCharacter();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('開啟時只打一支 snapshot API，12 個榜單全部在本地切出', async () => {
    render(<StatisticsCenter />);

    await waitFor(() => expect(screen.getAllByText('殺敵數').length).toBeGreaterThan(0));

    expect(snapshotCalls()).toHaveLength(1);
    // 12 個榜單標題皆出現（九宮格 + 我的統計共用同一組標籤，故取 >=1）
    for (const label of ['等級', '殺敵數', 'BOSS 討伐', '死亡次數', '武器爆掉', '任務貢獻度']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('10 分鐘內重新開啟不再打任何 API', async () => {
    render(<StatisticsCenter />);
    await waitFor(() => expect(snapshotCalls()).toHaveLength(1));

    cleanup();
    fetchMock.mockClear();

    render(<StatisticsCenter />);
    await waitFor(() => expect(screen.getAllByText('殺敵數').length).toBeGreaterThan(0));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('榜單依各欄位在本地正確排序（同一份 snapshot 切出不同名次）', async () => {
    render(<StatisticsCenter />);
    await waitFor(() => expect(snapshotCalls()).toHaveLength(1));

    // 殺敵數：我方 900 > 別人 500；等級：別人 30 > 我方 20
    const cards = document.querySelectorAll('.stats-card');
    const levelCard = [...cards].find(c => c.querySelector('.stats-card-title')?.textContent === '等級');
    const killCard = [...cards].find(c => c.querySelector('.stats-card-title')?.textContent === '殺敵數');

    expect(levelCard?.querySelectorAll('.stats-card-name')[0].textContent).toContain('別人');
    expect(killCard?.querySelectorAll('.stats-card-name')[0].textContent).toContain('我方');
  });

  it('舊角色未註冊時（stats 回 404）自動補註冊後重送', async () => {
    const seen: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      seen.push(u);
      if (u.includes('/api/snapshot')) return { ok: true, status: 200, json: async () => SNAPSHOT };
      if (u.includes('/api/character/register')) return { ok: true, status: 200, json: async () => ({ success: true }) };
      // 第一次 /api/stats 回 404，補註冊後的第二次成功
      const statsCalls = seen.filter(s => s.endsWith('/api/stats')).length;
      void init;
      return statsCalls === 1
        ? { ok: false, status: 404, json: async () => ({ error: 'not_registered' }) }
        : { ok: true, status: 200, json: async () => ({ success: true }) };
    });

    render(<StatisticsCenter />);
    await waitFor(() => expect(snapshotCalls()).toHaveLength(1));

    expect(seen.filter(u => u.includes('/api/character/register'))).toHaveLength(1);
    expect(seen.filter(u => u.endsWith('/api/stats'))).toHaveLength(2);
  });

  it('補註冊遇到名稱重複時提示無法上榜，但排行榜仍可瀏覽', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/snapshot')) return { ok: true, status: 200, json: async () => SNAPSHOT };
      if (u.includes('/api/character/register')) {
        return { ok: false, status: 409, json: async () => ({ error: 'name_taken' }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not_registered' }) };
    });

    render(<StatisticsCenter />);

    await waitFor(() => {
      expect(screen.getByText('角色名稱已被其他玩家使用，此角色無法登上排行榜')).toBeDefined();
    });
    expect(screen.getAllByText('殺敵數').length).toBeGreaterThan(0);
  });

  it('伺服器連不上時顯示錯誤訊息', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    render(<StatisticsCenter />);

    await waitFor(() => expect(screen.getByText('無法連線到排行榜伺服器')).toBeDefined());
  });
});
