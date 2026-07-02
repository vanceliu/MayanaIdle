import { describe, it, expect } from 'vitest';
import type { AdventurerQuest, GuildProgress } from '../../models/adventurerQuest';
import {
  generateQuestList,
  acceptQuest,
  abandonQuest,
  updateQuestProgress,
  rollCollectMaterialDrop,
  completeQuest,
  getPointsToNextRank,
} from '../adventurerQuestSystem';
import { getRankForPoints, GUILD_RANK_THRESHOLDS } from '../../models/adventurerQuest';

function makeQuest(overrides: Partial<AdventurerQuest> = {}): AdventurerQuest {
  return {
    id: 'test-quest-1',
    type: 'errand',
    difficulty: 'D',
    status: 'available',
    title: '測試任務',
    description: '測試描述',
    targetArea: 'dawn-plains',
    targetCount: 20,
    currentCount: 0,
    reward: { type: 'gold', amount: 1200 },
    contributionPoints: 20,
    ...overrides,
  };
}

describe('adventurerQuestSystem', () => {
  describe('generateQuestList', () => {
    it('generates 5-8 quests for a given difficulty', () => {
      const quests = generateQuestList('D', 'F');
      expect(quests.length).toBeGreaterThanOrEqual(5);
      expect(quests.length).toBeLessThanOrEqual(8);
    });

    it('all quests have the correct difficulty', () => {
      const quests = generateQuestList('B', 'C');
      for (const q of quests) {
        expect(q.difficulty).toBe('B');
      }
    });

    it('quests have valid types', () => {
      const quests = generateQuestList('A', 'A');
      for (const q of quests) {
        expect(['errand', 'collect', 'endurance', 'errandboss', 'collectboss']).toContain(q.type);
      }
    });

    it('quests have non-empty titles and descriptions', () => {
      const quests = generateQuestList('S', 'S');
      for (const q of quests) {
        expect(q.title.length).toBeGreaterThan(0);
        expect(q.description.length).toBeGreaterThan(0);
      }
    });

    it('collect quests have a target monster', () => {
      const quests = generateQuestList('C', 'F');
      const collectQuests = quests.filter(q => q.type === 'collect');
      for (const q of collectQuests) {
        expect(q.targetMonster).toBeDefined();
        expect(q.targetCount).toBe(5);
      }
    });
  });

  describe('acceptQuest', () => {
    it('accepts a quest when under limit', () => {
      const quest = makeQuest();
      const result = acceptQuest([], quest);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].status).toBe('active');
    });

    it('returns null when at max capacity', () => {
      const active = [
        makeQuest({ id: 'q1', status: 'active' }),
        makeQuest({ id: 'q2', status: 'active' }),
        makeQuest({ id: 'q3', status: 'active' }),
      ];
      const result = acceptQuest(active, makeQuest({ id: 'q4' }));
      expect(result).toBeNull();
    });

    it('returns null for duplicate quest', () => {
      const active = [makeQuest({ id: 'q1', status: 'active' })];
      const result = acceptQuest(active, makeQuest({ id: 'q1' }));
      expect(result).toBeNull();
    });
  });

  describe('abandonQuest', () => {
    it('removes quest and deducts contribution points', () => {
      const active = [makeQuest({ id: 'q1', status: 'active', contributionPoints: 20 })];
      const progress: GuildProgress = { rank: 'E', points: 250 };
      const result = abandonQuest(active, 'q1', progress);
      expect(result.activeQuests.length).toBe(0);
      expect(result.guildProgress.points).toBe(230);
    });

    it('does not go below 0 points', () => {
      const active = [makeQuest({ id: 'q1', status: 'active', contributionPoints: 100 })];
      const progress: GuildProgress = { rank: 'F', points: 50 };
      const result = abandonQuest(active, 'q1', progress);
      expect(result.guildProgress.points).toBe(0);
    });

    it('can cause rank demotion', () => {
      const active = [makeQuest({ id: 'q1', status: 'active', contributionPoints: 100 })];
      const progress: GuildProgress = { rank: 'E', points: 210 };
      const result = abandonQuest(active, 'q1', progress);
      expect(result.guildProgress.points).toBe(110);
      expect(result.guildProgress.rank).toBe('F');
    });
  });

  describe('updateQuestProgress', () => {
    it('updates errand quest when in correct area', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active', type: 'errand', targetArea: 'dawn-plains', currentCount: 5, targetCount: 20 }),
      ];
      const updated = updateQuestProgress(quests, 'dawn-plains', '暴牙兔', 1);
      expect(updated[0].currentCount).toBe(6);
    });

    it('does not update errand quest when in wrong area', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active', type: 'errand', targetArea: 'dawn-plains', currentCount: 5, targetCount: 20 }),
      ];
      const updated = updateQuestProgress(quests, 'green-valley', '野狼', 1);
      expect(updated[0].currentCount).toBe(5);
    });

    it('marks quest as completable when target reached', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active', type: 'errand', targetArea: 'dawn-plains', currentCount: 19, targetCount: 20 }),
      ];
      const updated = updateQuestProgress(quests, 'dawn-plains', '暴牙兔', 1);
      expect(updated[0].status).toBe('completable');
      expect(updated[0].currentCount).toBe(20);
    });

    it('updates collect quest when correct monster killed', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active', type: 'collect', targetMonster: '毒蛇', targetArea: 'misty-swamp', currentCount: 2, targetCount: 5 }),
      ];
      const updated = updateQuestProgress(quests, 'misty-swamp', '毒蛇', 1);
      expect(updated[0].currentCount).toBe(3);
    });

    it('does not exceed target count', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active', type: 'errand', targetArea: 'dawn-plains', currentCount: 19, targetCount: 20 }),
      ];
      const updated = updateQuestProgress(quests, 'dawn-plains', '暴牙兔', 5);
      expect(updated[0].currentCount).toBe(20);
    });
  });

  describe('completeQuest', () => {
    it('completes quest and adds contribution points', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'completable', contributionPoints: 20 }),
      ];
      const progress: GuildProgress = { rank: 'F', points: 180 };
      const result = completeQuest(quests, 'q1', progress);
      expect(result.reward).not.toBeNull();
      expect(result.guildProgress.points).toBe(200);
      expect(result.guildProgress.rank).toBe('E');
      expect(result.activeQuests.length).toBe(0);
    });

    it('does not complete non-completable quest', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active' }),
      ];
      const progress: GuildProgress = { rank: 'F', points: 100 };
      const result = completeQuest(quests, 'q1', progress);
      expect(result.reward).toBeNull();
      expect(result.guildProgress.points).toBe(100);
    });
  });

  describe('getRankForPoints', () => {
    it('returns F for 0 points', () => {
      expect(getRankForPoints(0)).toBe('F');
    });

    it('returns E at 200 points', () => {
      expect(getRankForPoints(200)).toBe('E');
    });

    it('returns D at 600 points', () => {
      expect(getRankForPoints(600)).toBe('D');
    });

    it('returns SS at 500000 points', () => {
      expect(getRankForPoints(500000)).toBe('SS');
    });
  });

  describe('getPointsToNextRank', () => {
    it('returns points needed for next rank', () => {
      const result = getPointsToNextRank({ rank: 'F', points: 100 });
      expect(result).toBe(100);
    });

    it('returns null for US rank', () => {
      const result = getPointsToNextRank({ rank: 'US', points: 10000000 });
      expect(result).toBeNull();
    });
  });

  describe('rollCollectMaterialDrop', () => {
    it('returns false when no collect quest for that monster', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active', type: 'collect', targetMonster: '毒蛇' }),
      ];
      expect(rollCollectMaterialDrop(quests, '野狼')).toBe(false);
    });
  });
});
