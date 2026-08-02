import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildBoard,
  fetchSnapshot,
  readCachedSnapshot,
  clearSnapshotCache,
  shouldUploadStats,
  markStatsUploaded,
  registerCharacter,
  uploadStats,
  checkNameAvailable,
  LeaderboardError,
  SNAPSHOT_TTL_MS,
  type LeaderboardSnapshot,
} from '../leaderboardService';

vi.mock('../turnstile', () => ({
  getTurnstileToken: vi.fn(async () => 'test-token'),
}));

const FIELDS = [
  'character_id', 'character_name', 'class_name',
  'character_level', 'monstersKilled', 'bossesKilled', 'deathCount',
  'equipmentCrafted', 'weaponEnhanceAttempts', 'armorEnhanceAttempts',
  'weaponsBroken', 'armorsBroken', 'questsCompleted',
  'totalGoldEarned', 'contribution', 'updated_at',
];

function makeRow(id: string, name: string, overrides: Record<string, number> = {}) {
  const base: Record<string, string | number> = {
    character_id: id,
    character_name: name,
    class_name: 'knight',
    character_level: 1,
    monstersKilled: 0,
    bossesKilled: 0,
    deathCount: 0,
    equipmentCrafted: 0,
    weaponEnhanceAttempts: 0,
    armorEnhanceAttempts: 0,
    weaponsBroken: 0,
    armorsBroken: 0,
    questsCompleted: 0,
    totalGoldEarned: 0,
    contribution: 0,
    updated_at: '2026-08-01 00:00:00',
    ...overrides,
  };
  return FIELDS.map(f => base[f]);
}

function makeSnapshot(rows: (string | number)[][]): LeaderboardSnapshot {
  return { top: 20, count: rows.length, fields: FIELDS, rows };
}

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('buildBoard', () => {
  it('依欄位由大到小排序並給出名次', () => {
    const snapshot = makeSnapshot([
      makeRow('a', 'Alpha', { monstersKilled: 10 }),
      makeRow('b', 'Bravo', { monstersKilled: 30 }),
      makeRow('c', 'Charlie', { monstersKilled: 20 }),
    ]);

    const board = buildBoard(snapshot, 'monstersKilled', 5);

    expect(board.map(e => e.character_name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    expect(board.map(e => e.rank)).toEqual([1, 2, 3]);
    expect(board[0].value).toBe(30);
  });

  it('同分時以 character_id 遞增排序（與伺服端 ORDER BY 一致）', () => {
    const snapshot = makeSnapshot([
      makeRow('c-id', 'Charlie', { bossesKilled: 5 }),
      makeRow('a-id', 'Alpha', { bossesKilled: 5 }),
      makeRow('b-id', 'Bravo', { bossesKilled: 5 }),
    ]);

    const board = buildBoard(snapshot, 'bossesKilled', 5);

    expect(board.map(e => e.character_id)).toEqual(['a-id', 'b-id', 'c-id']);
  });

  it('切片到指定筆數', () => {
    const snapshot = makeSnapshot(
      Array.from({ length: 12 }, (_, i) => makeRow(`id-${i}`, `P${i}`, { totalGoldEarned: i })),
    );

    expect(buildBoard(snapshot, 'totalGoldEarned', 5)).toHaveLength(5);
    expect(buildBoard(snapshot, 'totalGoldEarned', 5)[0].value).toBe(11);
  });

  it('同一份 snapshot 可切出所有欄位的榜單（不需額外請求）', () => {
    const snapshot = makeSnapshot([
      makeRow('a', 'Alpha', { monstersKilled: 100, deathCount: 1 }),
      makeRow('b', 'Bravo', { monstersKilled: 1, deathCount: 50 }),
    ]);

    expect(buildBoard(snapshot, 'monstersKilled', 5)[0].character_name).toBe('Alpha');
    expect(buildBoard(snapshot, 'deathCount', 5)[0].character_name).toBe('Bravo');
  });

  it('欄位不存在時回傳空陣列而非拋錯', () => {
    const snapshot: LeaderboardSnapshot = { top: 20, count: 0, fields: ['character_id'], rows: [] };
    expect(buildBoard(snapshot, 'monstersKilled', 5)).toEqual([]);
  });
});

describe('snapshot 快取', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('第一次取得會打 API 並寫入快取', async () => {
    const snapshot = makeSnapshot([makeRow('a', 'Alpha', { monstersKilled: 3 })]);
    fetchMock.mockResolvedValue(jsonResponse(snapshot));

    const result = await fetchSnapshot({ now: 1_000 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.rows).toHaveLength(1);
    expect(readCachedSnapshot(1_000)).not.toBeNull();
  });

  it('10 分鐘內再次取得完全不打 API', async () => {
    const snapshot = makeSnapshot([makeRow('a', 'Alpha')]);
    fetchMock.mockResolvedValue(jsonResponse(snapshot));

    await fetchSnapshot({ now: 1_000 });
    await fetchSnapshot({ now: 1_000 + SNAPSHOT_TTL_MS - 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('超過 10 分鐘後快取失效並重新請求', async () => {
    const snapshot = makeSnapshot([makeRow('a', 'Alpha')]);
    fetchMock.mockResolvedValue(jsonResponse(snapshot));

    await fetchSnapshot({ now: 1_000 });
    expect(readCachedSnapshot(1_000 + SNAPSHOT_TTL_MS)).toBeNull();

    await fetchSnapshot({ now: 1_000 + SNAPSHOT_TTL_MS });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('force 會略過仍新鮮的快取', async () => {
    const snapshot = makeSnapshot([makeRow('a', 'Alpha')]);
    fetchMock.mockResolvedValue(jsonResponse(snapshot));

    await fetchSnapshot({ now: 1_000 });
    await fetchSnapshot({ now: 1_100, force: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('快取內容毀損時視為無快取', async () => {
    localStorage.setItem('mayana_leaderboard_snapshot', '{ not json');
    expect(readCachedSnapshot()).toBeNull();
  });

  it('clearSnapshotCache 會清掉快取', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeSnapshot([])));
    await fetchSnapshot({ now: 1_000 });
    clearSnapshotCache();
    expect(readCachedSnapshot(1_000)).toBeNull();
  });

  it('連線失敗拋出 network 錯誤', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(fetchSnapshot({ now: 1 })).rejects.toMatchObject({ code: 'network' });
  });
});

describe('統計上傳節流', () => {
  beforeEach(() => localStorage.clear());

  it('從未上傳過時應上傳', () => {
    expect(shouldUploadStats('uuid-1', 1_000)).toBe(true);
  });

  it('10 分鐘內不重複上傳', () => {
    markStatsUploaded('uuid-1', 1_000);
    expect(shouldUploadStats('uuid-1', 1_000 + SNAPSHOT_TTL_MS - 1)).toBe(false);
    expect(shouldUploadStats('uuid-1', 1_000 + SNAPSHOT_TTL_MS)).toBe(true);
  });

  it('各角色獨立計時', () => {
    markStatsUploaded('uuid-1', 1_000);
    expect(shouldUploadStats('uuid-2', 1_000)).toBe(true);
  });
});

describe('名稱檢查與註冊', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('本機驗證不通過時不打 API', async () => {
    const result = await checkNameAvailable('壞 名字');
    expect(result.available).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('註冊成功不拋錯', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    await expect(registerCharacter({
      character_id: 'uuid', character_name: '勇者', class_name: 'knight', character_level: 1,
    })).resolves.toBeUndefined();
  });

  it('名稱重複時拋出 name_taken', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'name_taken' }, 409));
    await expect(registerCharacter({
      character_id: 'uuid', character_name: '勇者', class_name: 'knight', character_level: 1,
    })).rejects.toMatchObject({ code: 'name_taken' });
  });

  it('離線時拋出 network', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(registerCharacter({
      character_id: 'uuid', character_name: '勇者', class_name: 'knight', character_level: 1,
    })).rejects.toBeInstanceOf(LeaderboardError);
  });
});

describe('uploadStats', () => {
  const fetchMock = vi.fn();
  const payload = {
    character_id: 'uuid-1', class_name: 'knight', character_level: 10,
    monstersKilled: 1, bossesKilled: 0, deathCount: 0, equipmentCrafted: 0,
    weaponEnhanceAttempts: 0, armorEnhanceAttempts: 0, weaponsBroken: 0,
    armorsBroken: 0, questsCompleted: 0, totalGoldEarned: 0, contribution: 0,
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('未註冊的角色回 404 時拋出 not_registered，供呼叫端補註冊', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'not_registered' }, 404));
    await expect(uploadStats(payload)).rejects.toMatchObject({ code: 'not_registered' });
  });

  it('成功時不拋錯', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    await expect(uploadStats(payload)).resolves.toBeUndefined();
  });
});
