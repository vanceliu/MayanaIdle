import { afterEach, describe, it, expect, vi } from 'vitest';
import type { AdventurerQuest, BossPoolEntry, GuildProgress, QuestTownId } from '../../models/adventurerQuest';
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
  isDeliverQuestSatisfied,
} from '../adventurerQuestSystem';
import {
  AREA_POOLS,
  MAX_ACTIVE_ADVENTURER_QUESTS,
  ENDURANCE_COUNT_RANGE,
  BOSS_COLLECT_DROP_RATE,
  COLLECT_DROP_RATE,
  isDeliverQuestType,
  KILL_COUNT_RANGE,
  MULTI_ERRAND_TARGET_RANGE,
  DELIVER_COUNT_RANGE,
  DELIVER_VALUE_MULTIPLIER,
  MATERIAL_POOLS,
  SIGIL_DELIVER_ITEM_IDS,
  AFFIX_SIGIL_ITEM_IDS,
  AFFIX_SIGIL_UNIT_VALUE,
  CRAFT_SIGIL_UNIT_VALUE,
  QUEST_POTION_REWARD_CAP,
  BOSS_QUEST_POTION_REWARD_CAP,
  QUEST_CRAFTING_MATERIAL_REWARD_CAP,
  QUEST_SIGIL_REWARD_CAP,
  isBossDifficulty,
  BREAKTHROUGH_SIGIL_ITEM_ID,
  BOSS_POOLS,
  MONSTER_POOLS,
  TOWN_AREA_POOLS,
  TOWN_BOSS_POOLS,
  CRAFTING_MATERIAL_REWARDS,
  TIMED_UNIQUE_KILL_COUNT,
  getTownDifficulties,
  getRankForPoints,
} from '../../models/adventurerQuest';
import { getAreaDisplayName } from '../../wiki/hooks/useWikiData';
import { QUEST_GOLD_REWARD_CAP } from '../globalRates';
import { makeBagItem } from '../../models/bagItem';
import { MONSTER_SEEDS } from '../../db/seed/monsterSeeds';

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
    it('generates 7-9 quests for a given difficulty', () => {
      const quests = generateQuestList('D', 'F');
      expect(quests.length).toBeGreaterThanOrEqual(7);
      expect(quests.length).toBeLessThanOrEqual(9);
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
        expect(['errand', 'collect', 'endurance', 'multierrand', 'deliver', 'sigil', 'errandboss', 'collectboss'])
          .toContain(q.type);
      }
    });

    // § 36.9 步驟 2a：一般分頁不再出現 BOSS 任務，BOSS 分頁只出現 BOSS 任務
    it('never produces boss quests on the plain difficulty tabs', () => {
      for (const difficulty of ['D', 'C', 'B', 'A', 'S'] as const) {
        for (let i = 0; i < 30; i++) {
          for (const q of generateQuestList(difficulty, 'S')) {
            expect(['errand', 'collect', 'endurance', 'multierrand', 'deliver', 'sigil']).toContain(q.type);
            expect(q.difficulty).toBe(difficulty);
          }
        }
      }
    });

    it('only produces boss quests on the B+/A+/S+ tabs', () => {
      for (const difficulty of ['B+', 'A+', 'S+'] as const) {
        for (let i = 0; i < 30; i++) {
          const quests = generateQuestList(difficulty, 'S');
          expect(quests.length).toBeGreaterThanOrEqual(7);
          expect(quests.length).toBeLessThanOrEqual(9);
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
        expect.objectContaining({ name: '安塔巨龍', area: 'dragon-valley-7f' }),
      ]));
      expect(BOSS_POOLS['S+']).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: '朦朧蛇魔', area: 'misty-cave-3f' }),
        expect.objectContaining({ name: '深海獄王', area: 'underwater-prison-4f' }),
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

    it('accepts the 4th quest (§ 36.6.2)', () => {
      const active = ['q1', 'q2', 'q3'].map(id => makeQuest({ id, status: 'active' }));
      const result = acceptQuest(active, makeQuest({ id: 'q4' }));
      expect(result!.length).toBe(4);
    });

    it('returns null when at max capacity', () => {
      const active = Array.from({ length: MAX_ACTIVE_ADVENTURER_QUESTS }, (_, i) => makeQuest({ id: `q${i + 1}`, status: 'active' }));
      expect(MAX_ACTIVE_ADVENTURER_QUESTS).toBe(4);
      const result = acceptQuest(active, makeQuest({ id: 'q5' }));
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
      // § 36.6.1：BOSS 分頁需該城鎮區域池內至少有一隻該難度的 BOSS 或獨特魔物，不要求同字母一般池
      expect(getTownDifficulties('neutral-town')).toEqual(['D', 'C', 'B', 'B+', 'A', 'A+']);
      expect(getTownDifficulties('elsarth-town')).toEqual(['B+', 'A', 'A+', 'S', 'S+']);
      expect(getTownDifficulties('varden-town')).toEqual(['B+', 'A', 'A+', 'S', 'S+']);
      expect(getTownDifficulties('greyridge-town')).toEqual(['B+', 'A', 'A+', 'S', 'S+']);
    });

    it('各城鎮 BOSS 分頁的獨特魔物（§ 36.12.5）', () => {
      const uniques = (town: QuestTownId, diff: 'B+' | 'A+' | 'S+') =>
        (TOWN_BOSS_POOLS[town][diff] ?? []).filter(b => b.rank === 'unique').map(b => b.name).sort();
      const S_PLUS = ['遠古獄卒長', '遠古狙擊官', '遠古典獄官', '遠古弓術長', '封印術士', '封印屍王', '遠古食人妖精王'];
      const expected: Record<QuestTownId, Record<'B+' | 'A+' | 'S+', string[]>> = {
        'neutral-town': {
          'B+': ['冰牙狼王', '冰晶蝙蝠王', '象牙大巫師'],
          'A+': ['霜甲隊長', '象牙魔導長', '霜核元素', '霜甲統領'],
          'S+': [],
        },
        'elsarth-town': {
          'B+': ['妖魔大頭目', '腐根樹王'],
          'A+': ['血祭大祭司', '祭壇巨像', '蜥蜴首領', '洞窟巨蟲母', '亡魂將軍'],
          'S+': S_PLUS,
        },
        'varden-town': {
          'B+': ['鏡之守護靈', '湖光幻后'],
          'A+': ['碎鏡魔君', '逆影獵王', '典獄長', '溺亡之主', '潮汐巨靈', '亡魂將軍'],
          'S+': S_PLUS,
        },
        'greyridge-town': {
          'B+': ['骸骨百夫長'],
          'A+': ['巨人酋長', '飛龍王', '骷髏軍團長', '大莫蜘蛛女王', '骷髏神射將', '骷髏親衛隊長', '怨魂聚合體', '亡魂將軍'],
          'S+': S_PLUS,
        },
      };
      for (const town of Object.keys(expected) as QuestTownId[]) {
        for (const diff of ['B+', 'A+', 'S+'] as const) {
          expect(uniques(town, diff), `${town} ${diff}`).toEqual([...expected[town][diff]].sort());
        }
      }
    });

    it('BOSS 本身的城鎮分配不變', () => {
      const bosses = (town: QuestTownId) => Object.values(TOWN_BOSS_POOLS[town]).flat()
        .filter(b => b!.rank === 'boss').map(b => b!.name).sort();
      expect(bosses('neutral-town')).toEqual(['試煉飛龍', '雪地之主', '象牙塔惡魔'].sort());
      expect(bosses('elsarth-town')).toEqual(['朦朧蛇魔', '遠古騎士'].sort());
      expect(bosses('varden-town')).toEqual(['深海獄王', '遠古騎士'].sort());
      expect(bosses('greyridge-town')).toEqual([
        '安塔巨龍', '毒之皇女', '哥布林之王', '暗影吸血鬼', '不死殭屍王', '龍王約特勒', '冥王哈馬斯',
        '霜凍伊莉絲', '熔岩伊弗利特', '守護者之主', '百柱死神', '遠古騎士',
      ].sort());
    });

    it('neutral-town quests only target neutral/snow/ivory areas', () => {
      const neutralAreaIds = new Set(
        Object.values(TOWN_AREA_POOLS['neutral-town']).flat().map(a => a.areaId)
      );
      for (let i = 0; i < 50; i++) {
        const quests = generateQuestList('D', 'F', 'neutral-town');
        for (const q of quests) {
          // 交付型沒有目標區域（§ 36.10.2）
          if (isDeliverQuestType(q.type)) {
            expect(q.targetArea).toBe('');
            continue;
          }
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

    it('greyridge-town A quests target grey ridge and dragon valley areas', () => {
      const greyridgeAreaIds = new Set(
        (TOWN_AREA_POOLS['greyridge-town'].A ?? []).map(a => a.areaId)
      );
      for (let i = 0; i < 50; i++) {
        const quests = generateQuestList('A', 'F', 'greyridge-town');
        for (const q of quests) {
          if (q.type === 'errand' || q.type === 'endurance') {
            expect(greyridgeAreaIds.has(q.targetArea)).toBe(true);
          }
        }
      }
    });

    it('greyridge-town 不收兩陣營的專屬區域（§ 36.12.2）', () => {
      const greyridgeAreaIds = new Set(
        Object.values(TOWN_AREA_POOLS['greyridge-town']).flat().map(a => a.areaId)
      );
      for (const areaId of ['demon-forest', 'misty-cave-1f', 'mirror-forest', 'underwater-prison-1f']) {
        expect(greyridgeAreaIds.has(areaId), areaId).toBe(false);
      }
    });

    it('龍之谷與百柱塔只掛灰脊分部（§ 36.12.3）', () => {
      const central = (areaId: string) =>
        areaId.startsWith('dragon-valley') || areaId.startsWith('hundred-pillar');
      for (const town of ['elsarth-town', 'varden-town'] as const) {
        const areaIds = Object.values(TOWN_AREA_POOLS[town]).flat().map(a => a.areaId);
        expect(areaIds.filter(central), `${town} 仍留有中央區域`).toEqual([]);
      }
      const greyridge = Object.values(TOWN_AREA_POOLS['greyridge-town']).flat().map(a => a.areaId);
      expect(greyridge.filter(central).length, '灰脊池沒有中央區域').toBeGreaterThan(0);
    });

    it('elsarth-town does not produce D/C/B quests', () => {
      const quests = generateQuestList('D', 'F', 'elsarth-town');
      expect(quests.every(q => q.difficulty === 'D')).toBe(true);
      // Should still work as fallback (uses global pool)
    });
  });

  describe('獨特魔物的 BOSS 任務（§ 36.2.4、§ 36.2.5、§ 36.8.2）', () => {
    /** § 36.8.2 獨特魔物表：名稱 → [分頁, 區域, 金幣掉落] */
    const UNIQUE_TABLE: Record<string, ['B+' | 'A+' | 'S+', string, number]> = {
      冰牙狼王: ['B+', 'snow-field', 3000],
      妖魔大頭目: ['B+', 'demon-forest', 3000],
      鏡之守護靈: ['B+', 'mirror-forest', 3000],
      骸骨百夫長: ['B+', 'dragon-valley-outskirts', 3000],
      冰晶蝙蝠王: ['B+', 'ivory-tower-1f', 3000],
      腐根樹王: ['B+', 'rotleaf-path', 3000],
      湖光幻后: ['B+', 'glimmer-shore', 3000],
      象牙大巫師: ['B+', 'ivory-tower-2f', 3000],
      霜甲隊長: ['A+', 'ivory-tower-3f', 4000],
      象牙魔導長: ['A+', 'ivory-tower-3f', 4000],
      血祭大祭司: ['A+', 'demon-altar', 4000],
      祭壇巨像: ['A+', 'demon-altar', 4000],
      碎鏡魔君: ['A+', 'shattered-mirror', 4000],
      逆影獵王: ['A+', 'shattered-mirror', 4000],
      巨人酋長: ['A+', 'dragon-valley-surface', 4000],
      飛龍王: ['A+', 'dragon-valley-surface', 4000],
      霜核元素: ['A+', 'ivory-tower-4f', 4000],
      霜甲統領: ['A+', 'ivory-tower-4f', 4000],
      蜥蜴首領: ['A+', 'misty-cave-1f', 4000],
      典獄長: ['A+', 'underwater-prison-1f', 4000],
      骷髏軍團長: ['A+', 'dragon-valley-1f', 4000],
      溺亡之主: ['A+', 'underwater-prison-2f', 4000],
      亡魂將軍: ['A+', 'ancient-battlefield', 4000],
      洞窟巨蟲母: ['A+', 'misty-cave-2f', 5000],
      大莫蜘蛛女王: ['A+', 'dragon-valley-3f', 5000],
      骷髏神射將: ['A+', 'dragon-valley-3f', 5000],
      骷髏親衛隊長: ['A+', 'dragon-valley-3f', 5000],
      潮汐巨靈: ['A+', 'underwater-prison-3f', 5000],
      怨魂聚合體: ['A+', 'dragon-valley-5f', 5000],
      遠古獄卒長: ['S+', 'ancient-dungeon-1f', 5000],
      遠古狙擊官: ['S+', 'ancient-dungeon-1f', 5000],
      遠古典獄官: ['S+', 'ancient-dungeon-3f', 5000],
      遠古弓術長: ['S+', 'ancient-dungeon-3f', 5000],
      封印術士: ['S+', 'ancient-dungeon-3f', 5000],
      封印屍王: ['S+', 'ancient-dungeon-5f', 5000],
      遠古食人妖精王: ['S+', 'ancient-dungeon-7f', 7000],
    };
    const uniqueEntries = () => (['B+', 'A+', 'S+'] as const)
      .flatMap(d => BOSS_POOLS[d].filter(b => b.rank === 'unique').map(b => ({ ...b, difficulty: d })));

    it('36 隻獨特魔物全部在 BOSS 池，分頁／區域／金幣依 § 36.8.2', () => {
      const entries = uniqueEntries();
      expect(entries.map(e => e.name).sort()).toEqual(Object.keys(UNIQUE_TABLE).sort());
      for (const e of entries) {
        expect([e.difficulty, e.area, e.avgGold], e.name).toEqual(UNIQUE_TABLE[e.name]);
      }
    });

    it('所屬分頁依等級：Lv.30~39 B+、40~49 A+、50 以上 S+（§ 36.3.2）', () => {
      for (const e of uniqueEntries()) {
        const expected = e.level >= 50 ? 'S+' : e.level >= 40 ? 'A+' : 'B+';
        expect(e.difficulty, e.name).toBe(expected);
      }
    });

    it('定時旗標對應 seed 的 spawnMode', () => {
      for (const e of uniqueEntries()) {
        const seed = MONSTER_SEEDS.find(m => m.name === e.name)!;
        expect(e.timed, e.name).toBe(seed.spawnMode !== 'random');
      }
      for (const d of ['B+', 'A+', 'S+'] as const) {
        expect(BOSS_POOLS[d].filter(b => b.rank === 'boss').every(b => !b.timed)).toBe(true);
      }
    });

    it('定時獨特魔物只出殲滅 BOSS，且固定 1 隻；BOSS 素材收集只指定非定時目標', () => {
      let timedErrands = 0;
      let collects = 0;
      for (let i = 0; i < 200; i++) {
        for (const q of generateQuestList('A+', 'S', 'neutral-town')) {
          const entry = BOSS_POOLS['A+'].find(b => b.name === q.targetMonster)!;
          if (q.type === 'collectboss') {
            collects++;
            expect(entry.timed, q.targetMonster).toBe(false);
          } else if (entry.timed) {
            timedErrands++;
            expect(q.targetCount).toBe(TIMED_UNIQUE_KILL_COUNT);
          }
        }
      }
      expect(timedErrands).toBeGreaterThan(0);
      expect(collects).toBeGreaterThan(0);
    });

    it('非定時目標的殲滅數仍為 1~3', () => {
      const counts = new Set<number>();
      for (let i = 0; i < 200; i++) {
        for (const q of generateQuestList('B+', 'S', 'elsarth-town')) {
          if (q.type === 'errandboss') counts.add(q.targetCount);
        }
      }
      expect([...counts].sort()).toEqual([1, 2, 3]);
    });

    it('分頁內只有定時目標時一律出殲滅 BOSS', () => {
      const pools = TOWN_BOSS_POOLS['neutral-town'];
      const original = pools['A+'];
      pools['A+'] = original!.filter(b => b.timed);
      try {
        for (let i = 0; i < 50; i++) {
          for (const q of generateQuestList('A+', 'S', 'neutral-town')) {
            expect(q.type).toBe('errandboss');
            expect(q.targetCount).toBe(TIMED_UNIQUE_KILL_COUNT);
          }
        }
      } finally {
        pools['A+'] = original;
      }
    });

    it('獨特魔物任務的貢獻與金幣走 BOSS 公式', () => {
      let checked = 0;
      for (let i = 0; i < 100; i++) {
        for (const q of generateQuestList('B+', 'US', 'varden-town')) {
          const entry: BossPoolEntry = BOSS_POOLS['B+'].find(b => b.name === q.targetMonster)!;
          expect(entry.rank).toBe('unique');
          const base = q.type === 'errandboss' ? 80 : 100;
          expect(q.contributionPoints).toBe(base + Math.floor(entry.avgGold / 10));
          if (q.reward.type === 'gold') {
            const kills = q.type === 'collectboss' ? q.targetCount / BOSS_COLLECT_DROP_RATE : q.targetCount;
            expect(q.reward.amount).toBe(Math.min(QUEST_GOLD_REWARD_CAP, Math.floor(entry.avgGold * kills * 3 * 2)));
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    });

    it('殲滅獨特魔物只認名稱，跨樓層地圖組任一樓層皆計入（§ 36.11）', () => {
      const quest = makeQuest({
        type: 'errandboss', difficulty: 'A+', status: 'active',
        targetArea: 'dragon-valley-1f', targetMonster: '骷髏軍團長', targetCount: 2,
      });
      const once = updateQuestProgress([quest], 'dragon-valley-2f', '骷髏軍團長', 1);
      expect(once[0].currentCount).toBe(1);
      const twice = updateQuestProgress(once, 'dragon-valley-1f', '骷髏軍團長', 1);
      expect(twice[0].status).toBe('completable');
      expect(updateQuestProgress([quest], 'dragon-valley-1f', '骷髏', 1)[0].currentCount).toBe(0);
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

  describe('收集類的基準值除以掉率（§ 36.9 步驟 2d）', () => {
    /**
     * 收集任務的 `targetCount` 是**素材個數**不是擊殺數。
     * 不除掉率的話，40% 掉率等於把每殺報酬砍到殲滅的四成 —— 這條就是釘那個洞。
     */
    function goldBaseByType(difficulty: 'S' | 'S+'): Map<AdventurerQuest['type'], number[]> {
      const out = new Map<AdventurerQuest['type'], number[]>();
      for (let i = 0; i < 300; i++) {
        for (const q of generateQuestList(difficulty, 'F')) {
          if (q.reward.type !== 'gold') continue;
          const base = q.reward.amount / 2;
          // 還原成「每個素材／每隻怪的基準值」，才比得起來
          out.set(q.type, [...(out.get(q.type) ?? []), base / q.targetCount]);
        }
      }
      return out;
    }

    it('素材收集的每素材基準值 = 區域平均金幣 ÷ 掉率', () => {
      const perUnit = goldBaseByType('S').get('collect') ?? [];
      expect(perUnit.length).toBeGreaterThan(0);
      const golds = AREA_POOLS.S.map(a => a.avgGold);
      for (const value of perUnit) {
        expect(value).toBeGreaterThanOrEqual(Math.min(...golds) / COLLECT_DROP_RATE - 0.001);
        expect(value).toBeLessThanOrEqual(Math.max(...golds) / COLLECT_DROP_RATE + 0.001);
      }
    });

    it('素材收集的每殺價值與殲滅同級（差距在區域金幣的範圍內）', () => {
      const byType = goldBaseByType('S');
      // 每殺價值 = 每素材基準值 × 掉率
      const collect = (byType.get('collect') ?? []).map(v => v * COLLECT_DROP_RATE);
      const errand = byType.get('errand') ?? [];
      expect(collect.length).toBeGreaterThan(0);
      expect(errand.length).toBeGreaterThan(0);
      const golds = AREA_POOLS.S.map(a => a.avgGold);
      for (const value of [...collect, ...errand]) {
        expect(value).toBeGreaterThanOrEqual(Math.min(...golds) - 0.001);
        expect(value).toBeLessThanOrEqual(Math.max(...golds) + 0.001);
      }
    });

    it('BOSS 素材收集同樣除以自己的 30% 掉率', () => {
      // 金幣在 S+ 幾乎都碰上限，改用不會碰上限的詞綴印記驗公式
      let checked = 0;
      for (let i = 0; i < 400; i++) {
        for (const q of generateQuestList('S+', 'S')) {
          if (q.type !== 'collectboss' || q.reward.type !== 'affix-sigil') continue;
          const boss = BOSS_POOLS['S+'].find(b => b.name === q.targetMonster && b.area === q.targetArea)!;
          const base = boss.avgGold * (q.targetCount / BOSS_COLLECT_DROP_RATE) * 3;
          expect(q.reward.amount).toBe(Math.max(1, Math.floor(base / AFFIX_SIGIL_UNIT_VALUE)));
          expect(q.reward.amount).toBeLessThan(QUEST_SIGIL_REWARD_CAP);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  });

  describe('獎勵倍率（§ 36.3 / § 36.9 步驟 2f）', () => {
    // 等階只影響獎勵「種類」的權重（§ 36.5.2），不得影響數量倍率。
    // 迴歸：原實作對 US 等階額外乘 10，無文件依據。
    function goldAmounts(rank: GuildProgress['rank']): { base: number; type: AdventurerQuest['type'] }[] {
      const out: { base: number; type: AdventurerQuest['type'] }[] = [];
      for (let i = 0; i < 400; i++) {
        for (const q of generateQuestList('S', rank)) {
          if (q.reward.type === 'gold') {
            // 還原基準值：金幣獎勵 = 基準值 × 2
            out.push({ base: q.reward.amount / 2, type: q.type });
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
      const s = goldAmounts('S');
      const us = goldAmounts('US');
      expect(s.length).toBeGreaterThan(0);
      expect(us.length).toBeGreaterThan(0);
      expect(Math.max(...s.map(q => q.base))).toBeLessThanOrEqual(MAX_NORMAL_BASE);
      expect(Math.max(...us.map(q => q.base))).toBeLessThanOrEqual(MAX_NORMAL_BASE);
    });

    it('US 等階的 BOSS 任務金幣 = min(100,000, BOSS 金幣 × 期望擊殺數 × 3 × 2)，無 BOSS ×2', () => {
      // B+ 的 BOSS 殲滅金幣都在上限以下，驗得出有沒有多乘 ×2
      let uncapped = 0;
      for (let i = 0; i < 400; i++) {
        for (const q of generateQuestList('B+', 'US')) {
          if (q.reward.type !== 'gold') continue;
          const boss = BOSS_POOLS['B+'].find(b => b.name === q.targetMonster && b.area === q.targetArea)!;
          // 收集型的擊殺數 = 素材個數 ÷ 掉率（§ 36.9 步驟 2d）
          const kills = q.type === 'collectboss' ? q.targetCount / BOSS_COLLECT_DROP_RATE : q.targetCount;
          const expected = Math.floor(boss.avgGold * kills * 3 * 2);
          expect(q.reward.amount).toBe(Math.min(QUEST_GOLD_REWARD_CAP, expected));
          if (expected < QUEST_GOLD_REWARD_CAP) uncapped++;
        }
      }
      expect(uncapped).toBeGreaterThan(0);
    });
  });

  describe('印記獎勵換算（§ 36.5.1）', () => {
    const SIGIL_UNIT: Partial<Record<string, number>> = {
      'quality-stone': CRAFT_SIGIL_UNIT_VALUE,
      'enhancement-stone': CRAFT_SIGIL_UNIT_VALUE,
      'affix-sigil': AFFIX_SIGIL_UNIT_VALUE,
    };

    it('換算單價：工藝／精鍊 1,000 金/個、詞綴 10,000 金/個', () => {
      expect(CRAFT_SIGIL_UNIT_VALUE).toBe(1000);
      expect(AFFIX_SIGIL_UNIT_VALUE).toBe(10000);
    });

    it('一般殲滅：數量 = min(50, max(1, floor(區域平均金幣 × 數量 ÷ 單價)))', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) {
        for (const q of generateQuestList('S', 'S')) {
          const unit = SIGIL_UNIT[q.reward.type];
          if (q.type !== 'errand' || unit === undefined) continue;
          const area = AREA_POOLS.S.find(a => a.areaId === q.targetArea)!;
          expect(q.reward.amount).toBe(Math.min(QUEST_SIGIL_REWARD_CAP, Math.max(1, Math.floor(area.avgGold * q.targetCount / unit))));
          seen.add(q.reward.type);
        }
      }
      expect([...seen].sort()).toEqual(['affix-sigil', 'enhancement-stone', 'quality-stone']);
    });

    it('BOSS 殲滅：數量 = min(50, max(1, floor(BOSS 金幣 × 數量 × 3 ÷ 單價)))，無 BOSS ×2', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) {
        for (const q of generateQuestList('S+', 'S')) {
          const unit = SIGIL_UNIT[q.reward.type];
          if (q.type !== 'errandboss' || unit === undefined) continue;
          const boss = BOSS_POOLS['S+'].find(b => b.name === q.targetMonster && b.area === q.targetArea)!;
          expect(q.reward.amount).toBe(Math.min(QUEST_SIGIL_REWARD_CAP, Math.max(1, Math.floor(boss.avgGold * q.targetCount * 3 / unit))));
          seen.add(q.reward.type);
        }
      }
      expect([...seen].sort()).toEqual(['affix-sigil', 'enhancement-stone', 'quality-stone']);
    });
  });

  describe('獎勵數量上限（§ 36.5.1）', () => {
    const TABS = ['D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+'] as const;
    const SIGIL_TYPES = new Set(['quality-stone', 'enhancement-stone', 'affix-sigil']);

    function maxAmounts(): Map<string, number> {
      const max = new Map<string, number>();
      const track = (key: string, amount: number) => max.set(key, Math.max(max.get(key) ?? 0, amount));
      for (const tab of TABS) {
        for (let i = 0; i < 400; i++) {
          for (const q of generateQuestList(tab, 'S')) {
            const { type, amount } = q.reward;
            if (type === 'potion') track(isBossDifficulty(tab) ? 'boss-potion' : 'potion', amount);
            else if (SIGIL_TYPES.has(type)) track('sigil', amount);
            else track(type, amount);
          }
        }
      }
      return max;
    }

    it('上限值：金幣 100,000、藥水 100／BOSS 150、製作素材 50、印記 50', () => {
      expect(QUEST_GOLD_REWARD_CAP).toBe(100000);
      expect(QUEST_POTION_REWARD_CAP).toBe(100);
      expect(BOSS_QUEST_POTION_REWARD_CAP).toBe(150);
      expect(QUEST_CRAFTING_MATERIAL_REWARD_CAP).toBe(50);
      expect(QUEST_SIGIL_REWARD_CAP).toBe(50);
    });

    it('各類獎勵的最大值剛好等於上限（換算值超過上限的任務必定存在）', () => {
      const max = maxAmounts();
      expect(max.get('gold')).toBe(QUEST_GOLD_REWARD_CAP);
      expect(max.get('potion')).toBe(QUEST_POTION_REWARD_CAP);
      expect(max.get('boss-potion')).toBe(BOSS_QUEST_POTION_REWARD_CAP);
      expect(max.get('crafting-material')).toBe(QUEST_CRAFTING_MATERIAL_REWARD_CAP);
      expect(max.get('sigil')).toBe(QUEST_SIGIL_REWARD_CAP);
    });
  });

  describe('多目標殲滅（§ 36.2.8）', () => {
    function multiQuests(difficulty: 'D' | 'C' | 'B' | 'A' | 'S', rounds = 60): AdventurerQuest[] {
      const out: AdventurerQuest[] = [];
      for (let i = 0; i < rounds; i++) {
        out.push(...generateQuestList(difficulty, 'S').filter(q => q.type === 'multierrand'));
      }
      return out;
    }

    it('子目標全部在同一個區域，且總數等於殲滅任務的數量範圍', () => {
      const quests = multiQuests('A');
      expect(quests.length).toBeGreaterThan(0);
      for (const q of quests) {
        expect(q.subTargets!.length).toBeGreaterThanOrEqual(MULTI_ERRAND_TARGET_RANGE.min);
        expect(q.subTargets!.length).toBeLessThanOrEqual(MULTI_ERRAND_TARGET_RANGE.max);
        const total = q.subTargets!.reduce((sum, t) => sum + t.targetCount, 0);
        expect(total).toBe(q.targetCount);
        expect(q.targetCount).toBeGreaterThanOrEqual(KILL_COUNT_RANGE.A.min);
        expect(q.targetCount).toBeLessThanOrEqual(KILL_COUNT_RANGE.A.max);
        // 指定的怪必須都住在目標區域（§ 36.2.8）
        const inArea = new Set(MONSTER_POOLS.A.filter(m => m.area === q.targetArea).map(m => m.name));
        for (const sub of q.subTargets!) expect(inArea.has(sub.monster)).toBe(true);
      }
    });

    it('子目標不重複', () => {
      for (const q of multiQuests('B')) {
        const names = q.subTargets!.map(s => s.monster);
        expect(new Set(names).size).toBe(names.length);
      }
    });

    it('進度逐項計數，區域不符不計', () => {
      const quest = makeQuest({
        type: 'multierrand', status: 'active', targetCount: 10, targetArea: 'dawn-plains',
        subTargets: [
          { monster: '暴牙兔', targetCount: 6, currentCount: 0 },
          { monster: '野牛', targetCount: 4, currentCount: 0 },
        ],
      });

      // 區域不符：完全不計
      const elsewhere = updateQuestProgress([quest], 'green-valley', '暴牙兔', 3);
      expect(elsewhere[0].currentCount).toBe(0);

      // 名稱符合才進那一項
      const hit = updateQuestProgress([quest], 'dawn-plains', '暴牙兔', 3);
      expect(hit[0].subTargets![0].currentCount).toBe(3);
      expect(hit[0].subTargets![1].currentCount).toBe(0);
      expect(hit[0].currentCount).toBe(3);
      expect(hit[0].status).toBe('active');
    });

    it('只有每一項都滿了才算可交付 —— 打爆一種怪不能完成任務', () => {
      const quest = makeQuest({
        type: 'multierrand', status: 'active', targetCount: 10, targetArea: 'dawn-plains',
        subTargets: [
          { monster: '暴牙兔', targetCount: 6, currentCount: 0 },
          { monster: '野牛', targetCount: 4, currentCount: 0 },
        ],
      });

      const overkill = updateQuestProgress([quest], 'dawn-plains', '暴牙兔', 99);
      expect(overkill[0].subTargets![0].currentCount).toBe(6);   // 夾在上限
      expect(overkill[0].status).toBe('active');

      const done = updateQuestProgress(overkill, 'dawn-plains', '野牛', 4);
      expect(done[0].status).toBe('completable');
      expect(done[0].currentCount).toBe(10);
    });
  });

  describe('交付素材（§ 36.2.6）', () => {
    function deliverQuests(rounds = 200): AdventurerQuest[] {
      const out: AdventurerQuest[] = [];
      for (let i = 0; i < rounds; i++) {
        out.push(...generateQuestList('A', 'F').filter(q => q.type === 'deliver'));
      }
      return out;
    }

    it('指定的是該難度掉落表裡的素材，數量 3~10，且不寫區域', () => {
      const quests = deliverQuests();
      expect(quests.length).toBeGreaterThan(0);
      const validIds = new Set(MATERIAL_POOLS.A.map(m => m.itemId));
      for (const q of quests) {
        expect(validIds.has(q.targetItemId!)).toBe(true);
        expect(q.targetCount).toBeGreaterThanOrEqual(DELIVER_COUNT_RANGE.min);
        expect(q.targetCount).toBeLessThanOrEqual(DELIVER_COUNT_RANGE.max);
        expect(q.targetArea).toBe('');
      }
    });

    it('金幣獎勵 = 素材售價 × 數量 × 3 × 2（基準值 ×2）', () => {
      const goldQuests = deliverQuests().filter(q => q.reward.type === 'gold');
      expect(goldQuests.length).toBeGreaterThan(0);
      for (const q of goldQuests) {
        const sellPrice = MATERIAL_POOLS.A.find(m => m.itemId === q.targetItemId)!.sellPrice;
        expect(q.reward.amount).toBe(sellPrice * q.targetCount * DELIVER_VALUE_MULTIPLIER * 2);
      }
    });
  });

  describe('交付印記（§ 36.2.7）', () => {
    function sigilQuests(difficulty: 'D' | 'C' | 'B' | 'A' | 'S', rounds = 200): AdventurerQuest[] {
      const out: AdventurerQuest[] = [];
      for (let i = 0; i < rounds; i++) {
        out.push(...generateQuestList(difficulty, 'F').filter(q => q.type === 'sigil'));
      }
      return out;
    }

    it('交付的一律是精鍊或工藝印記', () => {
      for (const q of sigilQuests('B')) {
        expect(SIGIL_DELIVER_ITEM_IDS).toContain(q.targetItemId!);
      }
    });

    it('D／C 給金幣 = 印記賣價 × 數量 × 5，數量 8~12', () => {
      const quests = [...sigilQuests('D'), ...sigilQuests('C')];
      expect(quests.length).toBeGreaterThan(0);
      for (const q of quests) {
        expect(q.reward.type).toBe('gold');
        expect(q.targetCount).toBeGreaterThanOrEqual(8);
        expect(q.targetCount).toBeLessThanOrEqual(12);
        expect(q.reward.amount).toBe(50 * q.targetCount * 5);
      }
    });

    it('詞綴印記池是混沌／刺針／重刻／新增／封印，五種都抽得到', () => {
      expect([...AFFIX_SIGIL_ITEM_IDS].sort((a, b) => a - b)).toEqual([147, 148, 149, 161, 162]);
      const seen = new Set<number>();
      for (let i = 0; i < 20 && seen.size < 5; i++) {
        for (const q of [...sigilQuests('B'), ...sigilQuests('A')]) seen.add(q.reward.itemId!);
      }
      expect([...seen].sort((a, b) => a - b)).toEqual([147, 148, 149, 161, 162]);
    });

    it('B／A 是 8~12 換 1 個詞綴印記，一張最多 4 個', () => {
      const quests = [...sigilQuests('B'), ...sigilQuests('A')];
      expect(quests.length).toBeGreaterThan(0);
      for (const q of quests) {
        expect(q.reward.type).toBe('affix-sigil');
        expect(AFFIX_SIGIL_ITEM_IDS).toContain(q.reward.itemId!);
        expect(q.reward.amount).toBeGreaterThanOrEqual(1);
        expect(q.reward.amount).toBeLessThanOrEqual(4);
        const rate = q.targetCount / q.reward.amount;
        expect(Number.isInteger(rate)).toBe(true);
        expect(rate).toBeGreaterThanOrEqual(8);
        expect(rate).toBeLessThanOrEqual(12);
      }
    });

    it('S 是 45~60 換 1 個突破印記，一張最多 2 個', () => {
      const quests = sigilQuests('S');
      expect(quests.length).toBeGreaterThan(0);
      for (const q of quests) {
        expect(q.reward.type).toBe('breakthrough-sigil');
        expect(q.reward.itemId).toBe(BREAKTHROUGH_SIGIL_ITEM_ID);
        expect(q.reward.amount).toBeGreaterThanOrEqual(1);
        expect(q.reward.amount).toBeLessThanOrEqual(2);
        const rate = q.targetCount / q.reward.amount;
        expect(rate).toBeGreaterThanOrEqual(45);
        expect(rate).toBeLessThanOrEqual(60);
      }
    });
  });

  describe('交付型的完成判定（§ 36.11）', () => {
    const quest = () => makeQuest({
      type: 'deliver', status: 'active', targetItemId: 19, targetCount: 5,
      reward: { type: 'gold', amount: 210 },
    });

    it('背包不足就交不了，也不會扣貢獻', () => {
      const q = quest();
      const bag = [makeBagItem(19, 4)!];
      expect(isDeliverQuestSatisfied(q, bag)).toBe(false);
      const result = completeQuest([q], q.id, { rank: 'F', points: 0 }, bag);
      expect(result.reward).toBeNull();
      expect(result.activeQuests).toHaveLength(1);
      expect(result.guildProgress.points).toBe(0);
    });

    it('背包足量就能交，並回報要扣掉的數量', () => {
      const q = quest();
      const bag = [makeBagItem(19, 7)!];
      expect(isDeliverQuestSatisfied(q, bag)).toBe(true);
      const result = completeQuest([q], q.id, { rank: 'F', points: 0 }, bag);
      expect(result.reward).toEqual({ type: 'gold', amount: 210 });
      expect(result.consumed).toEqual({ itemId: 19, amount: 5 });
      expect(result.activeQuests).toHaveLength(0);
      expect(result.guildProgress.points).toBe(q.contributionPoints);
    });

    it('狀態停在 active 也交得了 —— 交付型不靠 status（§ 36.11）', () => {
      const q = quest();
      expect(q.status).toBe('active');
      const result = completeQuest([q], q.id, { rank: 'F', points: 0 }, [makeBagItem(19, 5)!]);
      expect(result.reward).not.toBeNull();
    });

    it('非交付型不回報 consumed', () => {
      const q = makeQuest({ status: 'completable' });
      const result = completeQuest([q], q.id, { rank: 'F', points: 0 });
      expect(result.consumed).toBeUndefined();
    });
  });

  describe('生成降級（§ 36.9 步驟 8）', () => {
    /**
     * 可指定目標不足時必須退回殲滅任務，不能產出殘缺的任務。
     * 用抽空池子的方式逼出降級路徑 —— 正式資料裡三個池都是滿的。
     */
    it('該難度沒有可指定素材時，交付素材降級為殲滅', () => {
      const original = [...MATERIAL_POOLS.D];
      MATERIAL_POOLS.D.length = 0;
      try {
        for (let i = 0; i < 200; i++) {
          const quest = generateSingleQuest('D', 'F', 0);
          expect(quest.type).not.toBe('deliver');
          if (quest.type === 'errand') {
            expect(quest.targetArea).not.toBe('');
            expect(quest.targetCount).toBeGreaterThanOrEqual(KILL_COUNT_RANGE.D.min);
          }
        }
      } finally {
        MATERIAL_POOLS.D.push(...original);
      }
    });

    it('該區域怪物不足兩種時，多目標殲滅降級為殲滅', () => {
      const original = [...MONSTER_POOLS.D];
      // 只留一隻怪：任何區域都湊不出兩種
      MONSTER_POOLS.D.length = 0;
      MONSTER_POOLS.D.push(original[0]);
      try {
        for (let i = 0; i < 200; i++) {
          const quest = generateSingleQuest('D', 'F', 0);
          expect(quest.type).not.toBe('multierrand');
          expect(quest.subTargets).toBeUndefined();
        }
      } finally {
        MONSTER_POOLS.D.length = 0;
        MONSTER_POOLS.D.push(...original);
      }
    });
  });
});
