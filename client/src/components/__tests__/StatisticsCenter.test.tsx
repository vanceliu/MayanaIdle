import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { StatisticsCenter } from '../town/StatisticsCenter';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultStatistics } from '../../models/statistics';
import type { Character } from '../../models/character';

// 上傳邏輯本身在 gameStore 測（含密鑰補發），這裡只驗統計中心的呼叫與提示。
// 真實實作會碰 IndexedDB，而本檔刻意不起 fake-indexeddb。
const uploadOwnStats = vi.fn<(options?: { force?: boolean }) => Promise<string>>(async () => 'uploaded');

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
    // 帶著密鑰，ensureAuthToken 就不會去碰 IndexedDB（本檔不起 fake-indexeddb）
    character: {
      id: 1, uuid, authToken: 'tok-mine', userId: 1, name: '我方', className: 'knight', level: 20,
    } as Character,
    statistics: createDefaultStatistics(),
    guildProgress: { rank: 'F', points: 0 },
    uploadOwnStats,
  } as never);
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
    uploadOwnStats.mockReset().mockResolvedValue('uploaded');
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

  it('開啟時先上傳一次自己的統計，再抓 snapshot', async () => {
    render(<StatisticsCenter />);
    await waitFor(() => expect(snapshotCalls()).toHaveLength(1));

    expect(uploadOwnStats).toHaveBeenCalledTimes(1);
    // 統計中心不強制上傳：節流與「數值未變」的判定留給 store
    expect(uploadOwnStats.mock.calls[0][0]).toBeUndefined();
  });

  it('密鑰不符時提示無法上榜，但排行榜仍可瀏覽', async () => {
    uploadOwnStats.mockResolvedValue('invalid_auth_token');

    render(<StatisticsCenter />);

    await waitFor(() => {
      expect(screen.getByText('此角色的排行榜紀錄由另一份存檔持有，統計無法上傳')).toBeDefined();
    });
    expect(screen.getAllByText('殺敵數').length).toBeGreaterThan(0);
  });

  it('版本落後時提示重新整理', async () => {
    uploadOwnStats.mockResolvedValue('outdated_client');

    render(<StatisticsCenter />);

    await waitFor(() => {
      expect(screen.getByText('遊戲已更新，請重新整理頁面以繼續上傳統計')).toBeDefined();
    });
  });

  it('上傳失敗（network）不擋排行榜瀏覽，也不顯示訊息', async () => {
    uploadOwnStats.mockResolvedValue('failed');

    render(<StatisticsCenter />);

    await waitFor(() => expect(screen.getAllByText('殺敵數').length).toBeGreaterThan(0));
    expect(document.querySelector('.stats-message')).toBeNull();
  });

  it('伺服器連不上時顯示錯誤訊息', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    render(<StatisticsCenter />);

    await waitFor(() => expect(screen.getByText('無法連線到排行榜伺服器')).toBeDefined());
  });
});
