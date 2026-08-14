import { MONSTER_SEEDS } from '../db/seed/monsterSeeds';
import { ITEM_DEFINITIONS } from '../db/seed/itemSeeds';

export type AdventurerQuestType = 'errand' | 'collect' | 'endurance' | 'errandboss' | 'collectboss';
/** 一般任務分頁（errand／collect／endurance） */
export type BaseQuestDifficulty = 'D' | 'C' | 'B' | 'A' | 'S';
/** BOSS 任務分頁（errandboss／collectboss），區域池沿用同字母的一般難度（§ 36.3.2） */
export type BossQuestDifficulty = 'B+' | 'A+' | 'S+';
export type AdventurerQuestDifficulty = BaseQuestDifficulty | BossQuestDifficulty;
export type AdventurerQuestStatus = 'available' | 'active' | 'completable';
export type GuildRank = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'US';
export type QuestTownId = 'neutral-town' | 'elsarth-town' | 'varden-town';

export type RewardType = 'gold' | 'potion' | 'quality-stone' | 'enhancement-stone' | 'weapon-scroll' | 'armor-scroll' | 'crafting-material';

export interface QuestReward {
  type: RewardType;
  /** 獎勵道具的 `ITEM_DEFINITIONS` id（`gold` 沒有）。名稱一律由 id 反查（§ 99.1） */
  itemId?: number;
  amount: number;
}

export interface AdventurerQuest {
  id: string;
  type: AdventurerQuestType;
  difficulty: AdventurerQuestDifficulty;
  status: AdventurerQuestStatus;
  title: string;
  description: string;
  targetArea: string;
  targetMonster?: string;
  targetCount: number;
  currentCount: number;
  reward: QuestReward;
  contributionPoints: number;
}

export interface GuildProgress {
  rank: GuildRank;
  points: number;
}

export const MAX_ACTIVE_ADVENTURER_QUESTS = 3;

/** § 36.6.3：手動刷新單一分頁的貢獻代價 */
export const QUEST_BOARD_REFRESH_COST = 50;

export const GUILD_RANK_ORDER: GuildRank[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'US'];

export const GUILD_RANK_THRESHOLDS: Record<GuildRank, number> = {
  F: 0,
  E: 200,
  D: 600,
  C: 1800,
  B: 5000,
  A: 15000,
  S: 100000,
  SS: 500000,
  US: 10000000,
};

/** § 36.4.2 基底貢獻表（一般分頁） */
export const CONTRIBUTION_POINTS: Record<BaseQuestDifficulty, Record<'errand' | 'collect' | 'endurance', number>> = {
  D: { errand: 10, collect: 20, endurance: 30 },
  C: { errand: 15, collect: 30, endurance: 45 },
  B: { errand: 30, collect: 45, endurance: 60 },
  A: { errand: 80, collect: 100, endurance: 120 },
  S: { errand: 150, collect: 160, endurance: 180 },
};

/** § 36.4.2 基底貢獻表（BOSS 分頁），數值與拆分前的 B/A/S 相同 */
export const BOSS_CONTRIBUTION_POINTS: Record<BossQuestDifficulty, Record<'errandboss' | 'collectboss', number>> = {
  'B+': { errandboss: 80, collectboss: 100 },
  'A+': { errandboss: 150, collectboss: 200 },
  'S+': { errandboss: 200, collectboss: 250 },
};

export const QUEST_TYPE_WEIGHTS = { errand: 40, collect: 30, endurance: 30 };
export const QUEST_TYPE_WEIGHTS_BOSS = { errandboss: 50, collectboss: 50 };

/** 一般難度 → 對應的 BOSS 分頁（§ 36.3.2） */
export const BOSS_DIFFICULTY_OF: Record<'B' | 'A' | 'S', BossQuestDifficulty> = {
  B: 'B+',
  A: 'A+',
  S: 'S+',
};

/** 分頁顯示順序（§ 36.6.1） */
export const QUEST_DIFFICULTY_ORDER: AdventurerQuestDifficulty[] = ['D', 'C', 'B', 'B+', 'A', 'A+', 'S', 'S+'];

/** 空任務板：每個分頁一個欄位，難度清單只有 `QUEST_DIFFICULTY_ORDER` 一個出處 */
export function createEmptyQuestBoard(): Record<AdventurerQuestDifficulty, AdventurerQuest[]> {
  return Object.fromEntries(
    QUEST_DIFFICULTY_ORDER.map(d => [d, [] as AdventurerQuest[]]),
  ) as Record<AdventurerQuestDifficulty, AdventurerQuest[]>;
}

export function isBossDifficulty(difficulty: AdventurerQuestDifficulty): difficulty is BossQuestDifficulty {
  return difficulty.endsWith('+');
}

/** BOSS 分頁沒有自己的區域／怪物／數值表，一律回退到同字母的一般難度 */
export function getBaseDifficulty(difficulty: AdventurerQuestDifficulty): BaseQuestDifficulty {
  return (isBossDifficulty(difficulty) ? difficulty.slice(0, -1) : difficulty) as BaseQuestDifficulty;
}

export const KILL_COUNT_RANGE: Record<BaseQuestDifficulty, { min: number; max: number }> = {
  D: { min: 15, max: 20 },
  C: { min: 15, max: 20 },
  B: { min: 20, max: 25 },
  A: { min: 20, max: 30 },
  S: { min: 25, max: 30 },
};

export const ENDURANCE_COUNT_RANGE: Record<BaseQuestDifficulty, { min: number; max: number }> = {
  D: { min: 50, max: 60 },
  C: { min: 55, max: 70 },
  B: { min: 60, max: 80 },
  A: { min: 70, max: 90 },
  S: { min: 80, max: 100 },
};

export const COLLECT_TARGET_COUNT_RANGE = { min: 1, max: 5 };
export const COLLECT_DROP_RATE = 0.4;
export const BOSS_KILL_COUNT_RANGE = { min: 1, max: 3 };
export const BOSS_COLLECT_TARGET_COUNT = 3;
export const BOSS_COLLECT_DROP_RATE = 0.3;

export interface AreaPoolEntry {
  areaId: string;
  areaName: string;
  avgGold: number;
}

function createFloorAreaEntries(
  baseId: string,
  baseName: string,
  floors: number[],
  avgGold: number,
): AreaPoolEntry[] {
  return floors.map(floor => ({
    areaId: `${baseId}-${floor}f`,
    areaName: `${baseName}${floor}樓`,
    avgGold,
  }));
}

export const AREA_POOLS: Record<BaseQuestDifficulty, AreaPoolEntry[]> = {
  D: [
    { areaId: 'dawn-plains', areaName: '曙光草原', avgGold: 30 },
    { areaId: 'green-valley', areaName: '翠綠谷地', avgGold: 57 },
  ],
  C: [
    { areaId: 'wind-woods', areaName: '風語林地', avgGold: 69 },
    { areaId: 'misty-swamp', areaName: '迷霧沼澤', avgGold: 78 },
    { areaId: 'trial-highlands', areaName: '試煉高地', avgGold: 90 },
  ],
  B: [
    { areaId: 'trial-highlands-top', areaName: '試煉高地頂部', avgGold: 115 },
    { areaId: 'snow-field', areaName: '雪原地帶', avgGold: 140 },
    { areaId: 'snow-field-deep', areaName: '雪原地帶深處', avgGold: 160 },
    ...createFloorAreaEntries('ivory-tower', '象牙塔', [1, 2, 3], 170),
  ],
  A: [
    { areaId: 'demon-forest', areaName: '妖魔森林', avgGold: 160 },
    { areaId: 'rotleaf-path', areaName: '腐葉林道', avgGold: 175 },
    { areaId: 'demon-altar', areaName: '妖魔祭壇', avgGold: 190 },
    { areaId: 'mirror-forest', areaName: '明鏡森林', avgGold: 160 },
    { areaId: 'glimmer-shore', areaName: '幻光湖畔', avgGold: 175 },
    { areaId: 'shattered-mirror', areaName: '碎鏡深林', avgGold: 190 },
    { areaId: 'dragon-valley-outskirts', areaName: '龍之谷外圍', avgGold: 120 },
    { areaId: 'dragon-valley-surface', areaName: '龍之谷', avgGold: 160 },
    { areaId: 'ancient-battlefield', areaName: '遠古戰場', avgGold: 275 },
    ...createFloorAreaEntries('ivory-tower', '象牙塔', [4, 5], 200),
    ...createFloorAreaEntries('misty-cave', '朦朧洞窟', [1, 2, 3], 250),
    ...createFloorAreaEntries('underwater-prison', '水下監獄', [1, 2, 3, 4], 250),
    ...createFloorAreaEntries('dragon-valley', '龍谷地間', [1, 2, 3, 4, 5, 6, 7], 250),
    { areaId: 'hundred-pillar-1-10f', areaName: '百柱塔 1-10F', avgGold: 275 },
    { areaId: 'hundred-pillar-11-20f', areaName: '百柱塔 11-20F', avgGold: 290 },
    { areaId: 'hundred-pillar-21-30f', areaName: '百柱塔 21-30F', avgGold: 300 },
    ...createFloorAreaEntries('ancient-dungeon', '遠古地監', [1, 2, 3, 4, 5, 6], 280),
  ],
  S: [
    { areaId: 'hundred-pillar-31-40f', areaName: '百柱塔 31-40F', avgGold: 350 },
    { areaId: 'hundred-pillar-41-50f', areaName: '百柱塔 41-50F', avgGold: 370 },
    { areaId: 'hundred-pillar-51-60f', areaName: '百柱塔 51-60F', avgGold: 390 },
    { areaId: 'hundred-pillar-61-70f', areaName: '百柱塔 61-70F', avgGold: 420 },
    { areaId: 'hundred-pillar-71-80f', areaName: '百柱塔 71-80F', avgGold: 430 },
    { areaId: 'hundred-pillar-81-90f', areaName: '百柱塔 81-90F', avgGold: 440 },
    { areaId: 'hundred-pillar-91-100f', areaName: '百柱塔 91-100F', avgGold: 450 },
    ...createFloorAreaEntries('ancient-dungeon', '遠古地監', [7, 8, 9], 400),
  ],
};

export const TOWN_AREA_POOLS: Record<QuestTownId, Partial<Record<BaseQuestDifficulty, AreaPoolEntry[]>>> = {
  'neutral-town': {
    D: AREA_POOLS.D,
    C: AREA_POOLS.C,
    B: AREA_POOLS.B,
    A: [
      ...createFloorAreaEntries('ivory-tower', '象牙塔', [4, 5], 200),
    ],
  },
  'elsarth-town': {
    A: [
      { areaId: 'demon-forest', areaName: '妖魔森林', avgGold: 160 },
      { areaId: 'rotleaf-path', areaName: '腐葉林道', avgGold: 175 },
      { areaId: 'demon-altar', areaName: '妖魔祭壇', avgGold: 190 },
      { areaId: 'dragon-valley-outskirts', areaName: '龍之谷外圍', avgGold: 120 },
      { areaId: 'dragon-valley-surface', areaName: '龍之谷', avgGold: 160 },
      { areaId: 'ancient-battlefield', areaName: '遠古戰場', avgGold: 275 },
      ...createFloorAreaEntries('misty-cave', '朦朧洞窟', [1, 2, 3], 250),
      ...createFloorAreaEntries('dragon-valley', '龍谷地間', [1, 2, 3, 4, 5, 6, 7], 250),
      { areaId: 'hundred-pillar-1-10f', areaName: '百柱塔 1-10F', avgGold: 275 },
      { areaId: 'hundred-pillar-11-20f', areaName: '百柱塔 11-20F', avgGold: 290 },
      { areaId: 'hundred-pillar-21-30f', areaName: '百柱塔 21-30F', avgGold: 300 },
      ...createFloorAreaEntries('ancient-dungeon', '遠古地監', [1, 2, 3, 4, 5, 6], 280),
    ],
    S: AREA_POOLS.S,
  },
  'varden-town': {
    A: [
      { areaId: 'mirror-forest', areaName: '明鏡森林', avgGold: 160 },
      { areaId: 'glimmer-shore', areaName: '幻光湖畔', avgGold: 175 },
      { areaId: 'shattered-mirror', areaName: '碎鏡深林', avgGold: 190 },
      { areaId: 'dragon-valley-outskirts', areaName: '龍之谷外圍', avgGold: 120 },
      { areaId: 'dragon-valley-surface', areaName: '龍之谷', avgGold: 160 },
      { areaId: 'ancient-battlefield', areaName: '遠古戰場', avgGold: 275 },
      ...createFloorAreaEntries('underwater-prison', '水下監獄', [1, 2, 3, 4], 250),
      ...createFloorAreaEntries('dragon-valley', '龍谷地間', [1, 2, 3, 4, 5, 6, 7], 250),
      { areaId: 'hundred-pillar-1-10f', areaName: '百柱塔 1-10F', avgGold: 275 },
      { areaId: 'hundred-pillar-11-20f', areaName: '百柱塔 11-20F', avgGold: 290 },
      { areaId: 'hundred-pillar-21-30f', areaName: '百柱塔 21-30F', avgGold: 300 },
      ...createFloorAreaEntries('ancient-dungeon', '遠古地監', [1, 2, 3, 4, 5, 6], 280),
    ],
    S: AREA_POOLS.S,
  },
};

const QUEST_AREA_MAPPING: Record<string, { questArea: string; difficulty: BaseQuestDifficulty }> = {
  'dawn-plains': { questArea: 'dawn-plains', difficulty: 'D' },
  'green-valley': { questArea: 'green-valley', difficulty: 'D' },
  'wind-woods': { questArea: 'wind-woods', difficulty: 'C' },
  'misty-swamp': { questArea: 'misty-swamp', difficulty: 'C' },
  'trial-highlands': { questArea: 'trial-highlands', difficulty: 'C' },
  'trial-highlands-top': { questArea: 'trial-highlands-top', difficulty: 'B' },
  'snow-field': { questArea: 'snow-field', difficulty: 'B' },
  'snow-field-deep': { questArea: 'snow-field-deep', difficulty: 'B' },
  'ivory-tower-1f': { questArea: 'ivory-tower-1f', difficulty: 'B' },
  'ivory-tower-2f': { questArea: 'ivory-tower-2f', difficulty: 'B' },
  'ivory-tower-3f': { questArea: 'ivory-tower-3f', difficulty: 'B' },
  'ivory-tower-4f': { questArea: 'ivory-tower-4f', difficulty: 'A' },
  'ivory-tower-5f': { questArea: 'ivory-tower-5f', difficulty: 'A' },
  'demon-forest': { questArea: 'demon-forest', difficulty: 'A' },
  'rotleaf-path': { questArea: 'rotleaf-path', difficulty: 'A' },
  'demon-altar': { questArea: 'demon-altar', difficulty: 'A' },
  'mirror-forest': { questArea: 'mirror-forest', difficulty: 'A' },
  'glimmer-shore': { questArea: 'glimmer-shore', difficulty: 'A' },
  'shattered-mirror': { questArea: 'shattered-mirror', difficulty: 'A' },
  'dragon-valley-outskirts': { questArea: 'dragon-valley-outskirts', difficulty: 'A' },
  'dragon-valley-surface': { questArea: 'dragon-valley-surface', difficulty: 'A' },
  'ancient-battlefield': { questArea: 'ancient-battlefield', difficulty: 'A' },
  'misty-cave-1f': { questArea: 'misty-cave-1f', difficulty: 'A' },
  'misty-cave-2f': { questArea: 'misty-cave-2f', difficulty: 'A' },
  'misty-cave-3f': { questArea: 'misty-cave-3f', difficulty: 'A' },
  'underwater-prison-1f': { questArea: 'underwater-prison-1f', difficulty: 'A' },
  'underwater-prison-2f': { questArea: 'underwater-prison-2f', difficulty: 'A' },
  'underwater-prison-3f': { questArea: 'underwater-prison-3f', difficulty: 'A' },
  'underwater-prison-4f': { questArea: 'underwater-prison-4f', difficulty: 'A' },
  'dragon-valley-1f': { questArea: 'dragon-valley-1f', difficulty: 'A' },
  'dragon-valley-2f': { questArea: 'dragon-valley-2f', difficulty: 'A' },
  'dragon-valley-3f': { questArea: 'dragon-valley-3f', difficulty: 'A' },
  'dragon-valley-4f': { questArea: 'dragon-valley-4f', difficulty: 'A' },
  'dragon-valley-5f': { questArea: 'dragon-valley-5f', difficulty: 'A' },
  'dragon-valley-6f': { questArea: 'dragon-valley-6f', difficulty: 'A' },
  'dragon-valley-7f': { questArea: 'dragon-valley-7f', difficulty: 'A' },
  'hundred-pillar-1-10f': { questArea: 'hundred-pillar-1-10f', difficulty: 'A' },
  'hundred-pillar-11-20f': { questArea: 'hundred-pillar-11-20f', difficulty: 'A' },
  'hundred-pillar-21-30f': { questArea: 'hundred-pillar-21-30f', difficulty: 'A' },
  'ancient-dungeon-1f': { questArea: 'ancient-dungeon-1f', difficulty: 'A' },
  'ancient-dungeon-2f': { questArea: 'ancient-dungeon-2f', difficulty: 'A' },
  'ancient-dungeon-3f': { questArea: 'ancient-dungeon-3f', difficulty: 'A' },
  'ancient-dungeon-4f': { questArea: 'ancient-dungeon-4f', difficulty: 'A' },
  'ancient-dungeon-5f': { questArea: 'ancient-dungeon-5f', difficulty: 'A' },
  'ancient-dungeon-6f': { questArea: 'ancient-dungeon-6f', difficulty: 'A' },
  'hundred-pillar-31-40f': { questArea: 'hundred-pillar-31-40f', difficulty: 'S' },
  'hundred-pillar-41-50f': { questArea: 'hundred-pillar-41-50f', difficulty: 'S' },
  'hundred-pillar-51-60f': { questArea: 'hundred-pillar-51-60f', difficulty: 'S' },
  'hundred-pillar-61-70f': { questArea: 'hundred-pillar-61-70f', difficulty: 'S' },
  'hundred-pillar-71-80f': { questArea: 'hundred-pillar-71-80f', difficulty: 'S' },
  'hundred-pillar-81-90f': { questArea: 'hundred-pillar-81-90f', difficulty: 'S' },
  'hundred-pillar-91-100f': { questArea: 'hundred-pillar-91-100f', difficulty: 'S' },
  'ancient-dungeon-7f': { questArea: 'ancient-dungeon-7f', difficulty: 'S' },
  'ancient-dungeon-8f': { questArea: 'ancient-dungeon-8f', difficulty: 'S' },
  'ancient-dungeon-9f': { questArea: 'ancient-dungeon-9f', difficulty: 'S' },
};

function buildMonsterPools(): Record<BaseQuestDifficulty, { name: string; area: string; questArea: string }[]> {
  const pools: Record<BaseQuestDifficulty, Map<string, { name: string; area: string; questArea: string }>> = {
    D: new Map(), C: new Map(), B: new Map(), A: new Map(), S: new Map(),
  };

  for (const monster of MONSTER_SEEDS) {
    if (monster.isBoss) continue;
    const mapping = QUEST_AREA_MAPPING[monster.area];
    if (!mapping) continue;
    const key = `${monster.name}|${monster.area}`;
    if (!pools[mapping.difficulty].has(key)) {
      pools[mapping.difficulty].set(key, { name: monster.name, area: monster.area, questArea: mapping.questArea });
    }
  }

  return {
    D: [...pools.D.values()],
    C: [...pools.C.values()],
    B: [...pools.B.values()],
    A: [...pools.A.values()],
    S: [...pools.S.values()],
  };
}

export const MONSTER_POOLS: Record<BaseQuestDifficulty, { name: string; area: string; questArea: string }[]> = buildMonsterPools();

export interface BossPoolEntry {
  name: string;
  area: string;
  avgGold: number;
}

interface BossQuestConfig {
  monsterName: string;
  difficulty: BossQuestDifficulty;
  questArea: string;
  avgGold: number;
}

const BOSS_QUEST_CONFIG: BossQuestConfig[] = [
  { monsterName: '試煉飛龍', difficulty: 'B+', questArea: 'trial-highlands-top', avgGold: 2500 },
  { monsterName: '雪地之主', difficulty: 'B+', questArea: 'snow-field-deep', avgGold: 3000 },
  { monsterName: '象牙塔惡魔', difficulty: 'A+', questArea: 'ivory-tower-5f', avgGold: 4000 },
  { monsterName: '朦朧蛇魔', difficulty: 'A+', questArea: 'misty-cave-3f', avgGold: 5000 },
  { monsterName: '深海獄王', difficulty: 'A+', questArea: 'underwater-prison-4f', avgGold: 5000 },
  { monsterName: '安塔巨龍', difficulty: 'A+', questArea: 'dragon-valley-7f', avgGold: 5000 },
  { monsterName: '毒之皇女', difficulty: 'A+', questArea: 'hundred-pillar-1-10f', avgGold: 4500 },
  { monsterName: '哥布林之王', difficulty: 'A+', questArea: 'hundred-pillar-11-20f', avgGold: 4500 },
  { monsterName: '暗影吸血鬼', difficulty: 'A+', questArea: 'hundred-pillar-21-30f', avgGold: 4500 },
  { monsterName: '不死殭屍王', difficulty: 'S+', questArea: 'hundred-pillar-31-40f', avgGold: 7000 },
  { monsterName: '龍王約特勒', difficulty: 'S+', questArea: 'hundred-pillar-41-50f', avgGold: 7000 },
  { monsterName: '冥王哈馬斯', difficulty: 'S+', questArea: 'hundred-pillar-51-60f', avgGold: 7000 },
  { monsterName: '霜凍伊莉絲', difficulty: 'S+', questArea: 'hundred-pillar-61-70f', avgGold: 8000 },
  { monsterName: '熔岩伊弗利特', difficulty: 'S+', questArea: 'hundred-pillar-71-80f', avgGold: 8000 },
  { monsterName: '守護者之主', difficulty: 'S+', questArea: 'hundred-pillar-81-90f', avgGold: 8500 },
  { monsterName: '百柱死神', difficulty: 'S+', questArea: 'hundred-pillar-91-100f', avgGold: 9000 },
  { monsterName: '遠古騎士', difficulty: 'S+', questArea: 'ancient-dungeon-9f', avgGold: 7500 },
];

function buildBossPools(): Record<BossQuestDifficulty, BossPoolEntry[]> {
  const pools: Record<BossQuestDifficulty, BossPoolEntry[]> = { 'B+': [], 'A+': [], 'S+': [] };
  const bossSeeds = MONSTER_SEEDS.filter(m => m.isBoss);

  for (const config of BOSS_QUEST_CONFIG) {
    const seed = bossSeeds.find(b => b.name === config.monsterName);
    if (!seed) continue;
    pools[config.difficulty].push({
      name: seed.name,
      area: config.questArea,
      avgGold: config.avgGold,
    });
  }

  return pools;
}

export const BOSS_POOLS: Record<BossQuestDifficulty, BossPoolEntry[]> = buildBossPools();

function getTownAreaIds(townId: QuestTownId): Set<string> {
  const pools = TOWN_AREA_POOLS[townId];
  const ids = new Set<string>();
  for (const entries of Object.values(pools)) {
    if (entries) for (const e of entries) ids.add(e.areaId);
  }
  return ids;
}

function buildTownMonsterPools(): Record<QuestTownId, Partial<Record<BaseQuestDifficulty, { name: string; area: string; questArea: string }[]>>> {
  const result: Record<QuestTownId, Partial<Record<BaseQuestDifficulty, { name: string; area: string; questArea: string }[]>>> = {
    'neutral-town': {},
    'elsarth-town': {},
    'varden-town': {},
  };
  const towns: QuestTownId[] = ['neutral-town', 'elsarth-town', 'varden-town'];
  for (const town of towns) {
    const areaIds = getTownAreaIds(town);
    const difficulties = Object.keys(TOWN_AREA_POOLS[town]) as BaseQuestDifficulty[];
    for (const diff of difficulties) {
      const filtered = MONSTER_POOLS[diff].filter(m => areaIds.has(m.area));
      if (filtered.length > 0) result[town][diff] = filtered;
    }
  }
  return result;
}

export const TOWN_MONSTER_POOLS = buildTownMonsterPools();

function buildTownBossPools(): Record<QuestTownId, Partial<Record<BossQuestDifficulty, BossPoolEntry[]>>> {
  const result: Record<QuestTownId, Partial<Record<BossQuestDifficulty, BossPoolEntry[]>>> = {
    'neutral-town': {},
    'elsarth-town': {},
    'varden-town': {},
  };
  const towns: QuestTownId[] = ['neutral-town', 'elsarth-town', 'varden-town'];
  for (const town of towns) {
    const areaIds = getTownAreaIds(town);
    const difficulties: BossQuestDifficulty[] = ['B+', 'A+', 'S+'];
    for (const diff of difficulties) {
      // BOSS 分頁沿用同字母一般難度的區域池（§ 36.12.2）
      if (!TOWN_AREA_POOLS[town][getBaseDifficulty(diff)]) continue;
      const filtered = BOSS_POOLS[diff].filter(b => areaIds.has(b.area));
      if (filtered.length > 0) result[town][diff] = filtered;
    }
  }
  return result;
}

export const TOWN_BOSS_POOLS = buildTownBossPools();

/**
 * § 36.6.1：一般分頁需要該城鎮有對應區域池；
 * BOSS 分頁另需該池內至少有一隻 BOSS；不滿足時整個分頁不顯示，不降級為殲滅任務。
 */
export function getTownDifficulties(townId: QuestTownId): AdventurerQuestDifficulty[] {
  return QUEST_DIFFICULTY_ORDER.filter(d => (
    isBossDifficulty(d)
      ? (TOWN_BOSS_POOLS[townId]?.[d]?.length ?? 0) > 0
      : !!TOWN_AREA_POOLS[townId]?.[d]
  ));
}

export const REWARD_WEIGHTS: Record<GuildRank, { type: RewardType; weight: number }[]> = {
  F: [
    { type: 'gold', weight: 40 },
    { type: 'potion', weight: 30 },
    { type: 'quality-stone', weight: 15 },
    { type: 'enhancement-stone', weight: 15 },
  ],
  E: [
    { type: 'gold', weight: 40 },
    { type: 'potion', weight: 30 },
    { type: 'quality-stone', weight: 15 },
    { type: 'enhancement-stone', weight: 15 },
  ],
  D: [
    { type: 'gold', weight: 40 },
    { type: 'potion', weight: 30 },
    { type: 'quality-stone', weight: 15 },
    { type: 'enhancement-stone', weight: 15 },
  ],
  C: [
    { type: 'gold', weight: 35 },
    { type: 'potion', weight: 25 },
    { type: 'quality-stone', weight: 20 },
    { type: 'enhancement-stone', weight: 20 },
  ],
  B: [
    { type: 'gold', weight: 25 },
    { type: 'potion', weight: 20 },
    { type: 'quality-stone', weight: 15 },
    { type: 'enhancement-stone', weight: 15 },
    { type: 'armor-scroll', weight: 15 },
    { type: 'crafting-material', weight: 10 },
  ],
  A: [
    { type: 'gold', weight: 20 },
    { type: 'potion', weight: 15 },
    { type: 'quality-stone', weight: 15 },
    { type: 'enhancement-stone', weight: 15 },
    { type: 'armor-scroll', weight: 13 },
    { type: 'weapon-scroll', weight: 10 },
    { type: 'crafting-material', weight: 12 },
  ],
  S: [
    { type: 'gold', weight: 17 },
    { type: 'potion', weight: 13 },
    { type: 'quality-stone', weight: 13 },
    { type: 'enhancement-stone', weight: 13 },
    { type: 'armor-scroll', weight: 15 },
    { type: 'weapon-scroll', weight: 15 },
    { type: 'crafting-material', weight: 14 },
  ],
  SS: [
    { type: 'gold', weight: 17 },
    { type: 'potion', weight: 13 },
    { type: 'quality-stone', weight: 13 },
    { type: 'enhancement-stone', weight: 13 },
    { type: 'armor-scroll', weight: 15 },
    { type: 'weapon-scroll', weight: 15 },
    { type: 'crafting-material', weight: 14 },
  ],
  US: [
    { type: 'gold', weight: 17 },
    { type: 'potion', weight: 13 },
    { type: 'quality-stone', weight: 13 },
    { type: 'enhancement-stone', weight: 13 },
    { type: 'armor-scroll', weight: 15 },
    { type: 'weapon-scroll', weight: 15 },
    { type: 'crafting-material', weight: 14 },
  ],
};

export const CRAFTING_MATERIAL_REWARDS: Partial<Record<BaseQuestDifficulty, number[]>> = {
  B: [11, 12],
  A: [13, 14],
  S: [15, 16, 17, 18],
};

const POTION_REWARD_IDS = [1, 2, 3, 133, 134];

export const POTION_REWARDS = POTION_REWARD_IDS.map(id => {
  const item = ITEM_DEFINITIONS.find(i => i.id === id)!;
  return { itemId: item.id, name: item.name, unitPrice: item.buyPrice! };
});

export { QUEST_TITLE_TEMPLATES } from '../db/seed/questTemplateSeeds';

export function getAreaNameById(areaId: string, difficulty: AdventurerQuestDifficulty): string {
  const pool = AREA_POOLS[getBaseDifficulty(difficulty)];
  return pool.find(a => a.areaId === areaId)?.areaName ?? areaId;
}

export function getRankIndex(rank: GuildRank): number {
  return GUILD_RANK_ORDER.indexOf(rank);
}

export function getNextRank(rank: GuildRank): GuildRank | null {
  const idx = getRankIndex(rank);
  if (idx >= GUILD_RANK_ORDER.length - 1) return null;
  return GUILD_RANK_ORDER[idx + 1];
}

export function getRankForPoints(points: number): GuildRank {
  for (let i = GUILD_RANK_ORDER.length - 1; i >= 0; i--) {
    if (points >= GUILD_RANK_THRESHOLDS[GUILD_RANK_ORDER[i]]) {
      return GUILD_RANK_ORDER[i];
    }
  }
  return 'F';
}
