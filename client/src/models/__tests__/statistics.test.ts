import { describe, it, expect } from 'vitest';
import { createDefaultStatistics, normalizeStatistics } from '../statistics';
import { LEADERBOARD_FIELDS, LEADERBOARD_LABELS } from '../../services/leaderboardService';

describe('角色統計（`37-statistics.md` § 37.1）', () => {
  it('獨特魔物擊殺數預設 0', () => {
    expect(createDefaultStatistics().uniqueMonstersKilled).toBe(0);
  });

  it('沒有 uniqueMonstersKilled 的舊存檔補 0，既有欄位保留', () => {
    const legacy = { monstersKilled: 120, bossesKilled: 3 };
    const stats = normalizeStatistics(legacy);
    expect(stats.uniqueMonstersKilled).toBe(0);
    expect(stats.monstersKilled).toBe(120);
    expect(stats.bossesKilled).toBe(3);
  });

  it('可作為排行依據（§ 37.4.3）', () => {
    expect(LEADERBOARD_FIELDS).toContain('uniqueMonstersKilled');
    expect(LEADERBOARD_LABELS.uniqueMonstersKilled).toBe('獨特魔物擊殺');
  });
});
