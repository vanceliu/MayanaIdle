import { afterEach, describe, it, expect, vi } from 'vitest';
import type { AdventurerQuest, GuildProgress } from '../../models/adventurerQuest';
import {
  generateQuestList,
  generateSingleQuest,
  acceptQuest,
  abandonQuest,
  updateQuestProgress,
  updateCollectQuestProgress,
  rollCollectMaterialDrop,
  completeQuest,
  getPointsToNextRank,
} from '../adventurerQuestSystem';
import {
  AREA_POOLS,
  ENDURANCE_COUNT_RANGE,
  BOSS_POOLS,
  MONSTER_POOLS,
  TOWN_AREA_POOLS,
  CRAFTING_MATERIAL_REWARDS,
  getTownDifficulties,
  getRankForPoints,
} from '../../models/adventurerQuest';
import { getAreaDisplayName } from '../../wiki/hooks/useWikiData';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    // § 36.9 步驟 2a：一般分頁不再出現 BOSS 任務，BOSS 分頁只出現 BOSS 任務
    it('never produces boss quests on the plain difficulty tabs', () => {
      for (const difficulty of ['D', 'C', 'B', 'A', 'S'] as const) {
        for (let i = 0; i < 30; i++) {
          for (const q of generateQuestList(difficulty, 'S')) {
            expect(['errand', 'collect', 'endurance']).toContain(q.type);
            expect(q.difficulty).toBe(difficulty);
          }
        }
      }
    });

    it('only produces boss quests on the B+/A+/S+ tabs', () => {
      for (const difficulty of ['B+', 'A+', 'S+'] as const) {
        for (let i = 0; i < 30; i++) {
          const quests = generateQuestList(difficulty, 'S');
          expect(quests.length).toBeGreaterThanOrEqual(5);
          expect(quests.length).toBeLessThanOrEqual(8);
          for (const q of quests) {
            expect(['errandboss', 'collectboss']).toContain(q.type);
            expect(q.difficulty).toBe(difficulty);
            expect(q.targetMonster).toBeDefined();
            expect(q.targetCount).toBeGreaterThanOrEqual(1);
            expect(q.targetCount).toBeLessThanOrEqual(3);
          }
        }
      }
    });

    // § 36.4.2：拆分後 BOSS 任務的貢獻數值與拆分前相同
    it('keeps boss contribution values unchanged after the split', () => {
      const quests = [
        ...generateQuestList('B+', 'S'),
        ...generateQuestList('A+', 'S'),
        ...generateQuestList('S+', 'S'),
      ];
      const expectedBase = { 'B+': { errandboss: 80, collectboss: 100 }, 'A+': { errandboss: 150, collectboss: 200 }, 'S+': { errandboss: 200, collectboss: 250 } } as const;
      for (const q of quests) {
        const boss = BOSS_POOLS[q.difficulty as 'B+' | 'A+' | 'S+'].find(b => b.name === q.targetMonster)!;
        const base = expectedBase[q.difficulty as 'B+' | 'A+' | 'S+'][q.type as 'errandboss' | 'collectboss'];
        expect(q.contributionPoints).toBe(base + Math.floor(boss.avgGold / 10));
      }
    });

    // § 36.9 步驟 5：無可用 BOSS 的城鎮該分頁不產生任務，也不降級成殲滅任務
    it('returns an empty board for a boss tab with no boss in the town pool', () => {
      expect(generateQuestList('S+', 'S', 'neutral-town')).toEqual([]);
    });

    // 在城外刷新任務板（例：追蹤視窗退出任務）時傳進來的是地圖 id，不是城鎮 id
    it('falls back to the global pools when refreshed outside a town', () => {
      const quests = generateQuestList('A+', 'S', 'trial-highlands-top' as never);
      expect(quests.length).toBeGreaterThan(0);
      for (const q of quests) {
        expect(['errandboss', 'collectboss']).toContain(q.type);
      }
      expect(() => generateSingleQuest('A+', 'S', 0, 'trial-highlands-top' as never)).not.toThrow();
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
        expect(q.targetCount).toBeGreaterThanOrEqual(1);
        expect(q.targetCount).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('quest area configuration', () => {
    it('uses concrete map ids for every multi-floor quest area', () => {
      const allAreaIds = Object.values(AREA_POOLS).flat().map(area => area.areaId);
      const aggregateAliases = [
        'ivory-tower-1-3f',
        'ivory-tower-4-5f',
        'misty-cave',
        'underwater-prison',
        'dragon-valley',
        'ancient-dungeon-1-6f',
        'ancient-dungeon-7-9f',
      ];

      expect(allAreaIds).toEqual(expect.arrayContaining([
        'ivory-tower-1f',
        'ivory-tower-2f',
        'ivory-tower-3f',
        'ivory-tower-4f',
        'ivory-tower-5f',
        'misty-cave-1f',
        'underwater-prison-4f',
        'dragon-valley-7f',
        'ancient-dungeon-1f',
        'ancient-dungeon-9f',
      ]));
      for (const alias of aggregateAliases) {
        expect(allAreaIds).not.toContain(alias);
      }
    });

    it('keeps collect quest areas scoped to the monster map id', () => {
      for (const monster of Object.values(MONSTER_POOLS).flat()) {
        expect(monster.questArea).toBe(monster.area);
      }
    });

    it('keeps boss quests scoped to the boss floor', () => {
      expect(BOSS_POOLS['A+']).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: '象牙塔惡魔', area: 'ivory-tower-5f' }),
        expect.objectContaining({ name: '朦朧蛇魔', area: 'misty-cave-3f' }),
        expect.objectContaining({ name: '深海獄王', area: 'underwater-prison-4f' }),
        expect.objectContaining({ name: '安塔巨龍', area: 'dragon-valley-7f' }),
      ]));
      expect(BOSS_POOLS['S+']).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: '遠古騎士', area: 'ancient-dungeon-9f' }),
      ]));
    });

    it('derives a floor display name from the selected map id', () => {
      expect(getAreaDisplayName('ivory-tower-1f')).toBe('象牙塔 1F');
      expect(getAreaDisplayName('ivory-tower-3f')).toBe('象牙塔 3F');
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

    it('only updates a multi-floor quest on its selected floor', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active', type: 'errand', targetArea: 'ivory-tower-2f', currentCount: 5, targetCount: 20 }),
      ];

      const wrongFloor = updateQuestProgress(quests, 'ivory-tower-1f', '象牙巫師', 1);
      expect(wrongFloor[0].currentCount).toBe(5);

      const selectedFloor = updateQuestProgress(quests, 'ivory-tower-2f', '象牙巫師', 1);
      expect(selectedFloor[0].currentCount).toBe(6);
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
      const updated = updateCollectQuestProgress(quests, '毒蛇', 1);
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

    // 相容性：拆分前接取的 BOSS 任務存的是 difficulty 'A'，不做資料遷移也要能正常交付
    it('completes a legacy boss quest stored with the pre-split difficulty', () => {
      const legacy: AdventurerQuest[] = [
        makeQuest({
          id: 'legacy-boss',
          status: 'completable',
          type: 'collectboss',
          difficulty: 'A',
          targetMonster: '象牙塔惡魔',
          targetCount: 3,
          currentCount: 3,
          contributionPoints: 600,
        }),
      ];
      const result = completeQuest(legacy, 'legacy-boss', { rank: 'C', points: 2000 });
      expect(result.reward).not.toBeNull();
      expect(result.guildProgress.points).toBe(2600);
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

    it('uses the fixed 40% normal collect drop rate', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active', type: 'collect', targetMonster: '毒蛇' }),
      ];

      vi.spyOn(Math, 'random').mockReturnValue(0.3999);
      expect(rollCollectMaterialDrop(quests, '毒蛇')).toBe(true);

      vi.spyOn(Math, 'random').mockReturnValue(0.4);
      expect(rollCollectMaterialDrop(quests, '毒蛇')).toBe(false);
    });

    it('uses the fixed 30% boss collect drop rate', () => {
      const quests: AdventurerQuest[] = [
        makeQuest({ id: 'q1', status: 'active', type: 'collectboss', targetMonster: '象牙塔惡魔' }),
      ];

      vi.spyOn(Math, 'random').mockReturnValue(0.2999);
      expect(rollCollectMaterialDrop(quests, '象牙塔惡魔')).toBe(true);

      vi.spyOn(Math, 'random').mockReturnValue(0.3);
      expect(rollCollectMaterialDrop(quests, '象牙塔惡魔')).toBe(false);
    });
  });

  describe('town-specific quest generation', () => {
    it('getTownDifficulties returns correct difficulties per town', () => {
      // § 36.6.1：BOSS 分頁需該城鎮該難度池內至少有一隻 BOSS
      expect(getTownDifficulties('neutral-town')).toEqual(['D', 'C', 'B', 'B+', 'A', 'A+']);
      expect(getTownDifficulties('elsarth-town')).toEqual(['A', 'A+', 'S', 'S+']);
      expect(getTownDifficulties('varden-town')).toEqual(['A', 'A+', 'S', 'S+']);
    });

    it('neutral-town quests only target neutral/snow/ivory areas', () => {
      const neutralAreaIds = new Set(
        Object.values(TOWN_AREA_POOLS['neutral-town']).flat().map(a => a.areaId)
      );
      for (let i = 0; i < 50; i++) {
        const quests = generateQuestList('D', 'F', 'neutral-town');
        for (const q of quests) {
          expect(neutralAreaIds.has(q.targetArea)).toBe(true);
        }
      }
    });

    it('elsarth-town A quests target elsarth-related areas', () => {
      const elsarthAreaIds = new Set(
        (TOWN_AREA_POOLS['elsarth-town'].A ?? []).map(a => a.areaId)
      );
      for (let i = 0; i < 50; i++) {
        const quests = generateQuestList('A', 'F', 'elsarth-town');
        for (const q of quests) {
          if (q.type === 'errand' || q.type === 'endurance') {
            expect(elsarthAreaIds.has(q.targetArea)).toBe(true);
          }
        }
      }
    });

    it('varden-town A quests target varden-related areas', () => {
      const vardenAreaIds = new Set(
        (TOWN_AREA_POOLS['varden-town'].A ?? []).map(a => a.areaId)
      );
      for (let i = 0; i < 50; i++) {
        const quests = generateQuestList('A', 'F', 'varden-town');
        for (const q of quests) {
          if (q.type === 'errand' || q.type === 'endurance') {
            expect(vardenAreaIds.has(q.targetArea)).toBe(true);
          }
        }
      }
    });

    it('elsarth-town does not produce D/C/B quests', () => {
      const quests = generateQuestList('D', 'F', 'elsarth-town');
      expect(quests.every(q => q.difficulty === 'D')).toBe(true);
      // Should still work as fallback (uses global pool)
    });
  });

  describe('crafting material rewards', () => {
    it('CRAFTING_MATERIAL_REWARDS has correct item IDs per difficulty', () => {
      expect(CRAFTING_MATERIAL_REWARDS.B).toEqual([11, 12]);
      expect(CRAFTING_MATERIAL_REWARDS.A).toEqual([13, 14]);
      expect(CRAFTING_MATERIAL_REWARDS.S).toEqual([15, 16, 17, 18]);
      expect(CRAFTING_MATERIAL_REWARDS.D).toBeUndefined();
      expect(CRAFTING_MATERIAL_REWARDS.C).toBeUndefined();
    });

    it('B+ rank quests can produce crafting-material rewards', () => {
      let found = false;
      for (let i = 0; i < 200; i++) {
        const quests = generateQuestList('B', 'B');
        if (quests.some(q => q.reward.type === 'crafting-material')) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('crafting-material reward has valid item info and amount >= 1', () => {
      for (let i = 0; i < 200; i++) {
        const quests = generateQuestList('A', 'A');
        for (const q of quests) {
          if (q.reward.type === 'crafting-material') {
            expect(q.reward.itemId).toBeDefined();
            expect(q.reward.amount).toBeGreaterThanOrEqual(1);
            expect([13, 14]).toContain(q.reward.itemId);
            return;
          }
        }
      }
      throw new Error('No crafting-material reward found after 200 iterations');
    });
  });

  describe('獎勵倍率（§ 36.3 / § 36.9 步驟 2f）', () => {
    // 等階只影響獎勵「種類」的權重（§ 36.5.2），不得影響數量倍率。
    // 迴歸：原實作對 US 等階額外乘 10，且與 BOSS ×2 互斥，兩者皆無文件依據。
    function goldAmounts(rank: GuildProgress['rank'], bossOnly: boolean): number[] {
      const out: number[] = [];
      // 拆分後 BOSS 任務只出現在 S+ 分頁（§ 36.3.2）
      for (let i = 0; i < 400; i++) {
        for (const q of generateQuestList(bossOnly ? 'S+' : 'S', rank)) {
          const isBoss = q.type === 'errandboss' || q.type === 'collectboss';
          if (q.reward.type === 'gold' && isBoss === bossOnly) {
            // 還原基準值：金幣獎勵 = 基準值 × 2
            out.push(q.reward.amount / (2 * (isBoss ? 2 : 1)));
          }
        }
      }
      return out;
    }

    /**
     * 非 BOSS 的還原基準值上界 = `max(S 級 avgGold) × max(targetCount)`。
     * targetCount 最大的是耐力型，因此上界由 ENDURANCE_COUNT_RANGE 決定。
     *
     * **不拿兩組隨機樣本的最大值互比** —— 那樣要靠容差，而兩組樣本最大值的比值
     * 散布達 ±7%，5% 容差會有 2% 的機率誤判（實測 400 次失敗 8 次）。
     * 改判固定上界：被迴歸盯上的錯誤實作（US 額外 ×10）會超標 10 倍，判得出來且不會翻船。
     */
    const MAX_NORMAL_BASE =
      Math.max(...AREA_POOLS.S.map(a => a.avgGold)) * ENDURANCE_COUNT_RANGE.S.max;

    it('US 等階的一般任務金幣與 S 等階走同一條公式（無額外倍率）', () => {
      const s = goldAmounts('S', false);
      const us = goldAmounts('US', false);
      expect(s.length).toBeGreaterThan(0);
      expect(us.length).toBeGreaterThan(0);
      expect(Math.max(...s)).toBeLessThanOrEqual(MAX_NORMAL_BASE);
      expect(Math.max(...us)).toBeLessThanOrEqual(MAX_NORMAL_BASE);
    });

    it('US 等階的 BOSS 任務仍享有且僅有 ×2', () => {
      const us = goldAmounts('US', true);
      expect(us.length).toBeGreaterThan(0);
      // 還原後應等於 avgGold × count × 3，S 級 BOSS avgGold 7000~9000、count 1~3
      for (const base of us) {
        expect(base).toBeGreaterThanOrEqual(7000 * 1 * 3);
        expect(base).toBeLessThanOrEqual(9000 * 3 * 3);
      }
    });
  });
});
