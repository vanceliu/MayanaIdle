import type {
  AdventurerQuest,
  AdventurerQuestType,
  AdventurerQuestDifficulty,
  GuildProgress,
  GuildRank,
  QuestReward,
  RewardType,
  QuestTownId,
  BossQuestDifficulty,
  BossPoolEntry,
} from '../models/adventurerQuest';
import {
  MAX_ACTIVE_ADVENTURER_QUESTS,
  CONTRIBUTION_POINTS,
  BOSS_CONTRIBUTION_POINTS,
  QUEST_TYPE_WEIGHTS,
  QUEST_TYPE_WEIGHTS_BOSS,
  KILL_COUNT_RANGE,
  ENDURANCE_COUNT_RANGE,
  COLLECT_TARGET_COUNT_RANGE,
  COLLECT_DROP_RATE,
  BOSS_KILL_COUNT_RANGE,
  BOSS_COLLECT_TARGET_COUNT,
  BOSS_COLLECT_DROP_RATE,
  AREA_POOLS,
  TOWN_AREA_POOLS,
  MONSTER_POOLS,
  TOWN_MONSTER_POOLS,
  BOSS_POOLS,
  TOWN_BOSS_POOLS,
  REWARD_WEIGHTS,
  POTION_REWARDS,
  CRAFTING_MATERIAL_REWARDS,
  GUILD_RANK_THRESHOLDS,
  GUILD_RANK_ORDER,
  getRankForPoints,
  getRankIndex,
  getBaseDifficulty,
  isBossDifficulty,
  BOSS_DIFFICULTY_OF,
} from '../models/adventurerQuest';
import { ITEM_DEFINITIONS } from '../db/seed/itemSeeds';
import { QUEST_TITLE_TEMPLATES, QUEST_DESCRIPTION_TEMPLATES } from '../db/seed/questTemplateSeeds';
import { getAreaDisplayName } from '../wiki/hooks/useWikiData';

function getItem(id: number) {
  return ITEM_DEFINITIONS.find(i => i.id === id)!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/** § 36.9 步驟 2a：BOSS 分頁只產 BOSS 任務，一般分頁只產一般任務 */
function pickQuestType(difficulty: AdventurerQuestDifficulty): AdventurerQuestType {
  if (isBossDifficulty(difficulty)) {
    const items = [
      { type: 'errandboss' as const, weight: QUEST_TYPE_WEIGHTS_BOSS.errandboss },
      { type: 'collectboss' as const, weight: QUEST_TYPE_WEIGHTS_BOSS.collectboss },
    ];
    return weightedPick(items).type;
  }
  const items = [
    { type: 'errand' as const, weight: QUEST_TYPE_WEIGHTS.errand },
    { type: 'collect' as const, weight: QUEST_TYPE_WEIGHTS.collect },
    { type: 'endurance' as const, weight: QUEST_TYPE_WEIGHTS.endurance },
  ];
  return weightedPick(items).type;
}

/**
 * 任務板可能在城外被刷新（例：在任務追蹤視窗退出任務），此時 `currentArea` 不是城鎮 id。
 * 非城鎮一律視為「不做城鎮過濾」，不可直接拿去索引城鎮池（會取到 undefined）。
 */
function asQuestTown(townId?: string): QuestTownId | undefined {
  return townId && townId in TOWN_AREA_POOLS ? townId as QuestTownId : undefined;
}

/** § 36.12.5：城鎮 BOSS 池不回退到全域，避免出現該城鎮管不到的 BOSS */
function getBossPool(difficulty: AdventurerQuestDifficulty, townId?: QuestTownId): BossPoolEntry[] {
  if (!isBossDifficulty(difficulty)) return [];
  return townId ? (TOWN_BOSS_POOLS[townId][difficulty] ?? []) : BOSS_POOLS[difficulty];
}

/** 舊存檔的 BOSS 任務存的是拆分前的 'B'|'A'|'S'，查表前先轉成對應的 + 分頁 */
function toBossDifficulty(difficulty: AdventurerQuestDifficulty): BossQuestDifficulty {
  return isBossDifficulty(difficulty)
    ? difficulty
    : BOSS_DIFFICULTY_OF[getBaseDifficulty(difficulty) as 'B' | 'A' | 'S'] ?? 'B+';
}

function generateQuestTitle(type: AdventurerQuestType): string {
  const titles = QUEST_TITLE_TEMPLATES[type];
  return titles[Math.floor(Math.random() * titles.length)];
}

function generateQuestDescription(
  type: AdventurerQuestType,
  areaName: string,
  monsterName: string | undefined,
  count: number,
): string {
  const templates = QUEST_DESCRIPTION_TEMPLATES[type];
  const opening = pickRandom(templates.openings)
    .replace('{area}', areaName);
  const task = pickRandom(templates.tasks)
    .replace('{area}', areaName)
    .replace('{monster}', monsterName ?? '')
    .replace('{count}', String(count));
  return opening + task;
}

function calculateReward(
  type: RewardType,
  baseValue: number,
  difficulty: AdventurerQuestDifficulty = 'D',
): QuestReward {
  switch (type) {
    case 'gold':
      return { type: 'gold', amount: Math.floor(baseValue * 2) };
    case 'potion': {
      const potion = pickRandom(POTION_REWARDS);
      const amount = Math.max(1, Math.floor(baseValue / potion.unitPrice));
      return { type: 'potion', itemId: potion.itemId, amount };
    }
    case 'quality-stone': {
      const item = getItem(9);
      return { type: 'quality-stone', itemId: item.id, amount: Math.max(1, Math.floor(baseValue / 100)) };
    }
    case 'enhancement-stone': {
      const item = getItem(10);
      return { type: 'enhancement-stone', itemId: item.id, amount: Math.max(1, Math.floor(baseValue / 100)) };
    }
    case 'weapon-scroll': {
      const item = getItem(7);
      return { type: 'weapon-scroll', itemId: item.id, amount: 1 };
    }
    case 'armor-scroll': {
      const item = getItem(8);
      return { type: 'armor-scroll', itemId: item.id, amount: 1 };
    }
    case 'crafting-material': {
      const materialIds = CRAFTING_MATERIAL_REWARDS[getBaseDifficulty(difficulty)] ?? CRAFTING_MATERIAL_REWARDS.B!;
      const itemId = pickRandom(materialIds);
      const item = getItem(itemId);
      const amount = Math.max(1, Math.floor(baseValue / (item.sellPrice! * 3)));
      return { type: 'crafting-material', itemId: item.id, amount };
    }
  }
}

export function generateSingleQuest(
  difficulty: AdventurerQuestDifficulty,
  guildRank: GuildRank,
  index: number,
  rawTownId?: QuestTownId,
): AdventurerQuest {
  const townId = asQuestTown(rawTownId);
  const type = pickQuestType(difficulty);
  let targetArea: string;
  let areaName: string;
  let targetMonster: string | undefined;
  let targetCount: number;
  let avgGold: number;

  // BOSS 分頁沿用同字母一般難度的區域／怪物池（§ 36.3.2）
  const base = getBaseDifficulty(difficulty);
  const areaPool = (townId ? TOWN_AREA_POOLS[townId][base] : undefined) ?? AREA_POOLS[base];
  const monsterPool = (townId ? TOWN_MONSTER_POOLS[townId]?.[base] : undefined) ?? MONSTER_POOLS[base];
  const bossPool = getBossPool(difficulty, townId);

  if (type === 'collect') {
    if (monsterPool.length === 0) {
      const areaEntry = pickRandom(areaPool);
      targetArea = areaEntry.areaId;
      areaName = getAreaDisplayName(targetArea);
      avgGold = areaEntry.avgGold;
      targetCount = randomInt(KILL_COUNT_RANGE[base].min, KILL_COUNT_RANGE[base].max);
      return buildQuest('errand', difficulty, targetArea, areaName, undefined, targetCount, avgGold, guildRank, index);
    }
    const monsterEntry = pickRandom(monsterPool);
    targetMonster = monsterEntry.name;
    targetArea = monsterEntry.area;
    areaName = getAreaDisplayName(monsterEntry.area);
    avgGold = areaPool.find(a => a.areaId === monsterEntry.questArea)?.avgGold ?? 50;
    targetCount = randomInt(COLLECT_TARGET_COUNT_RANGE.min, COLLECT_TARGET_COUNT_RANGE.max);
  } else if (type === 'errandboss' || type === 'collectboss') {
    // § 36.9 步驟 5：BOSS 分頁不降級。無可用 BOSS 的城鎮該分頁根本不會生成（見 generateQuestList），
    // 這裡退回全域 BOSS 池只是防禦，全域池必定非空。
    const bossEntry = pickRandom(bossPool.length > 0 ? bossPool : BOSS_POOLS[difficulty as BossQuestDifficulty]);
    targetMonster = bossEntry.name;
    targetArea = bossEntry.area;
    areaName = getAreaDisplayName(targetArea);
    avgGold = bossEntry.avgGold;

    if (type === 'errandboss') {
      targetCount = randomInt(BOSS_KILL_COUNT_RANGE.min, BOSS_KILL_COUNT_RANGE.max);
    } else {
      targetCount = randomInt(1, BOSS_COLLECT_TARGET_COUNT);
    }
  } else {
    const areaEntry = pickRandom(areaPool);
    targetArea = areaEntry.areaId;
    areaName = getAreaDisplayName(targetArea);
    avgGold = areaEntry.avgGold;

    if (type === 'errand') {
      const range = KILL_COUNT_RANGE[base];
      targetCount = randomInt(range.min, range.max);
    } else {
      const range = ENDURANCE_COUNT_RANGE[base];
      targetCount = randomInt(range.min, range.max);
    }
  }

  return buildQuest(type, difficulty, targetArea, areaName, targetMonster, targetCount, avgGold, guildRank, index);
}

function buildQuest(
  type: AdventurerQuestType,
  difficulty: AdventurerQuestDifficulty,
  targetArea: string,
  areaName: string,
  targetMonster: string | undefined,
  targetCount: number,
  avgGold: number,
  guildRank: GuildRank,
  index: number,
): AdventurerQuest {
  const isBossQuest = type === 'errandboss' || type === 'collectboss';
  const baseValue = isBossQuest ? avgGold * targetCount * 3 : avgGold * targetCount;
  const rewardWeights = REWARD_WEIGHTS[guildRank];
  const rewardType = weightedPick(rewardWeights).type;
  // § 36.9 步驟 2f：BOSS 任務獎勵 ×2。等階只影響獎勵「種類」的權重（§ 36.5.2），不影響數量倍率。
  const rewardMultiplier = isBossQuest ? 2 : 1;
  const reward = calculateReward(rewardType, baseValue * rewardMultiplier, difficulty);
  // § 36.4.2：BOSS 分頁與一般分頁各有一張基底貢獻表
  const baseContribution = isBossQuest
    ? BOSS_CONTRIBUTION_POINTS[toBossDifficulty(difficulty)][type as 'errandboss' | 'collectboss']
    : CONTRIBUTION_POINTS[getBaseDifficulty(difficulty)][type as 'errand' | 'collect' | 'endurance'];
  const areaBonus = Math.floor(avgGold / 10);
  const contributionPoints = baseContribution + areaBonus;
  const title = generateQuestTitle(type);
  const description = generateQuestDescription(type, areaName, targetMonster, targetCount);

  return {
    id: `adv-${difficulty}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    difficulty,
    status: 'available',
    title,
    description,
    targetArea,
    targetMonster,
    targetCount,
    currentCount: 0,
    reward,
    contributionPoints,
  };
}

export function generateQuestList(
  difficulty: AdventurerQuestDifficulty,
  guildRank: GuildRank,
  rawTownId?: QuestTownId,
): AdventurerQuest[] {
  const townId = asQuestTown(rawTownId);
  // § 36.6.1：該城鎮該難度無可用 BOSS 時整個分頁不顯示，不產生降級後的殲滅任務
  if (isBossDifficulty(difficulty) && getBossPool(difficulty, townId).length === 0) return [];
  const count = randomInt(5, 8);
  const quests: AdventurerQuest[] = [];
  for (let i = 0; i < count; i++) {
    quests.push(generateSingleQuest(difficulty, guildRank, i, townId));
  }
  return quests;
}

export function acceptQuest(
  activeQuests: AdventurerQuest[],
  quest: AdventurerQuest,
): AdventurerQuest[] | null {
  if (activeQuests.length >= MAX_ACTIVE_ADVENTURER_QUESTS) return null;
  if (activeQuests.some(q => q.id === quest.id)) return null;
  return [...activeQuests, { ...quest, status: 'active' }];
}

export function abandonQuest(
  activeQuests: AdventurerQuest[],
  questId: string,
  guildProgress: GuildProgress,
): { activeQuests: AdventurerQuest[]; guildProgress: GuildProgress } {
  const quest = activeQuests.find(q => q.id === questId);
  if (!quest) return { activeQuests, guildProgress };

  const newPoints = Math.max(0, guildProgress.points - quest.contributionPoints);
  const newRank = getRankForPoints(newPoints);

  return {
    activeQuests: activeQuests.filter(q => q.id !== questId),
    guildProgress: { rank: newRank, points: newPoints },
  };
}

export function updateQuestProgress(
  activeQuests: AdventurerQuest[],
  currentArea: string,
  monsterName: string,
  killCount: number,
): AdventurerQuest[] {
  return activeQuests.map(quest => {
    if (quest.status !== 'active') return quest;

    let shouldUpdate = false;

    if (quest.type === 'errand' || quest.type === 'endurance') {
      if (quest.targetArea === currentArea) {
        shouldUpdate = true;
      }
    } else if (quest.type === 'errandboss') {
      if (quest.targetMonster === monsterName) {
        shouldUpdate = true;
      }
    }

    if (!shouldUpdate) return quest;

    const newCount = Math.min(quest.currentCount + killCount, quest.targetCount);
    const newStatus = newCount >= quest.targetCount ? 'completable' as const : 'active' as const;
    return { ...quest, currentCount: newCount, status: newStatus };
  });
}

export function updateCollectQuestProgress(
  activeQuests: AdventurerQuest[],
  monsterName: string,
  amount: number,
): AdventurerQuest[] {
  return activeQuests.map(quest => {
    if (quest.status !== 'active') return quest;
    if (quest.type !== 'collect' && quest.type !== 'collectboss') return quest;
    if (quest.targetMonster !== monsterName) return quest;

    const newCount = Math.min(quest.currentCount + amount, quest.targetCount);
    const newStatus = newCount >= quest.targetCount ? 'completable' as const : 'active' as const;
    return { ...quest, currentCount: newCount, status: newStatus };
  });
}

export function rollCollectMaterialDrop(
  activeQuests: AdventurerQuest[],
  monsterName: string,
): boolean {
  const hasActiveBossCollect = activeQuests.some(
    q => q.type === 'collectboss' && q.status === 'active' && q.targetMonster === monsterName
  );
  if (hasActiveBossCollect) return Math.random() < BOSS_COLLECT_DROP_RATE;

  const hasActiveCollect = activeQuests.some(
    q => q.type === 'collect' && q.status === 'active' && q.targetMonster === monsterName
  );
  if (!hasActiveCollect) return false;
  return Math.random() < COLLECT_DROP_RATE;
}

export function completeQuest(
  activeQuests: AdventurerQuest[],
  questId: string,
  guildProgress: GuildProgress,
): { activeQuests: AdventurerQuest[]; guildProgress: GuildProgress; reward: QuestReward | null } {
  const quest = activeQuests.find(q => q.id === questId);
  if (!quest || quest.status !== 'completable') {
    return { activeQuests, guildProgress, reward: null };
  }

  const newPoints = guildProgress.points + quest.contributionPoints;
  const newRank = getRankForPoints(newPoints);

  return {
    activeQuests: activeQuests.filter(q => q.id !== questId),
    guildProgress: { rank: newRank, points: newPoints },
    reward: quest.reward,
  };
}

export function getPointsToNextRank(guildProgress: GuildProgress): number | null {
  const currentIdx = getRankIndex(guildProgress.rank);
  if (currentIdx >= GUILD_RANK_ORDER.length - 1) return null;
  const nextRank = GUILD_RANK_ORDER[currentIdx + 1];
  return GUILD_RANK_THRESHOLDS[nextRank] - guildProgress.points;
}
