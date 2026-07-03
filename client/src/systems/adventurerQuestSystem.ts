import type {
  AdventurerQuest,
  AdventurerQuestType,
  AdventurerQuestDifficulty,
  GuildProgress,
  GuildRank,
  QuestReward,
  RewardType,
} from '../models/adventurerQuest';
import {
  MAX_ACTIVE_ADVENTURER_QUESTS,
  CONTRIBUTION_POINTS,
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
  MONSTER_POOLS,
  BOSS_POOLS,
  REWARD_WEIGHTS,
  POTION_REWARDS,
  QUEST_TITLE_TEMPLATES,
  GUILD_RANK_THRESHOLDS,
  GUILD_RANK_ORDER,
  getRankForPoints,
  getRankIndex,
} from '../models/adventurerQuest';
import { ITEM_DEFINITIONS } from '../db/seed/itemSeeds';
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

function pickQuestType(difficulty: AdventurerQuestDifficulty): AdventurerQuestType {
  const hasBoss = difficulty === 'B' || difficulty === 'A' || difficulty === 'S';
  if (hasBoss) {
    const items = [
      { type: 'errand' as const, weight: QUEST_TYPE_WEIGHTS_BOSS.errand },
      { type: 'collect' as const, weight: QUEST_TYPE_WEIGHTS_BOSS.collect },
      { type: 'endurance' as const, weight: QUEST_TYPE_WEIGHTS_BOSS.endurance },
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

const ERRAND_TEMPLATES = {
  openings: [
    '最近{area}附近的怪物活動頻繁，',
    '{area}的居民反映怪物數量增加，',
    '巡邏隊回報{area}出現異常怪物聚集，',
    '有冒險者在{area}遭遇襲擊，',
    '{area}的商路受到怪物威脅，',
    '情報顯示{area}的怪物正在擴大地盤，',
    '工會接獲{area}周邊的求救信號，',
    '近日{area}的怪物變得特別兇猛，',
    '守衛隊長表示{area}的巡邏壓力越來越大，',
    '旅行商人回報{area}的路線已不安全，',
    '附近村莊的獵人發現{area}的怪物異常活躍，',
    '斥候回報{area}周圍有大批怪物遷移跡象，',
    '工會收到多起來自{area}的怪物目擊報告，',
    '{area}的採藥師近日頻繁遭到怪物攻擊，',
    '駐守{area}的哨兵請求工會派遣增援，',
  ],
  tasks: [
    '請前往該區域擊殺任意怪物 **{count} 隻**。',
    '希望你能前往清理 **{count} 隻** 怪物。',
    '請協助驅逐 **{count} 隻** 怪物以確保安全。',
    '需要你前往處理 **{count} 隻** 怪物來恢復秩序。',
    '請前往殲滅 **{count} 隻** 怪物以解除威脅。',
    '目標是消滅 **{count} 隻** 怪物，讓居民恢復正常生活。',
    '請盡快前往擊退 **{count} 隻** 怪物。',
    '需要立即處理 **{count} 隻** 怪物，否則情況會惡化。',
    '工會要求你清除該區域的 **{count} 隻** 怪物。',
    '請前往巡邏並擊殺 **{count} 隻** 怪物以穩定局勢。',
  ],
};

const COLLECT_TEMPLATES = {
  openings: [
    '煉金術師急需一批研究材料，',
    '工匠協會正在尋找特殊素材，',
    '城鎮的藥劑師需要特定怪物素材，',
    '學院的研究員委託工會協助採集，',
    '鐵匠鋪收到了一批特殊訂單，',
    '有位商人高價收購特定素材，',
    '工會倉庫的庫存不足，需要補充材料，',
    '一位神秘客人委託收集稀有素材，',
    '王都的皇家工坊急需一批特殊原料，',
    '防具工匠正在開發新配方，缺少關鍵材料，',
    '附魔師需要特定怪物的精華來完成儀式，',
    '城鎮醫師急需怪物素材來配製解藥，',
    '一位流浪鍊金師願意以秘方交換素材，',
    '工會接到軍方訂單，需要大量特殊材料，',
    '知名藥師開出高價收購清單，',
  ],
  tasks: [
    '請擊殺 **{area}** 的 **{monster}** 收集素材 **{count} 個**。',
    '目標是從 **{area}** 的 **{monster}** 身上取得 **{count} 個** 素材。',
    '需要你前往 **{area}** 狩獵 **{monster}**，收集 **{count} 個** 掉落材料。',
    '請到 **{area}** 找到 **{monster}** 並採集 **{count} 個** 素材。',
    '在 **{area}** 擊敗 **{monster}** 並帶回 **{count} 個** 材料。',
    '前往 **{area}** 獵殺 **{monster}**，目標為 **{count} 個** 素材。',
    '請從 **{area}** 的 **{monster}** 取得 **{count} 個** 掉落物。',
    '需要 **{area}** 的 **{monster}** 所持有的 **{count} 個** 素材。',
  ],
};

const ENDURANCE_TEMPLATES = {
  openings: [
    '工會收到情報，{area}出現大規模怪物聚集，',
    '{area}的怪物密度已超過警戒線，',
    '前線據點回報{area}的怪物壓力持續上升，',
    '為了確保{area}的長期安全，',
    '{area}需要進行一次徹底的清剿行動，',
    '偵察兵發現{area}的怪物巢穴有擴張跡象，',
    '多位冒險者反映{area}的怪物密度過高，',
    '工會決定對{area}發起大規模掃蕩，',
    '近期{area}的怪物繁殖速度異常加快，',
    '{area}已淪為怪物橫行的危險地帶，',
    '情報顯示{area}的怪物正在建立新的巢穴，',
    '工會判斷{area}需要長時間的持續清剿，',
    '駐守部隊無力應對{area}的怪物數量，',
    '生態調查顯示{area}的怪物族群已失控，',
    '若不盡快處理，{area}的怪物將威脅周邊城鎮，',
  ],
  tasks: [
    '請前往長期巡邏並擊殺任意怪物 **{count} 隻**。',
    '需要你持續作戰，累計擊殺 **{count} 隻** 怪物。',
    '請協助進行深度清剿，目標 **{count} 隻** 怪物。',
    '這次行動要求累計消滅 **{count} 隻** 怪物。',
    '請持續戰鬥直到擊殺 **{count} 隻** 怪物為止。',
    '本次任務需要長期駐守，累計擊殺 **{count} 隻** 怪物。',
    '請做好長期作戰的準備，目標為殲滅 **{count} 隻** 怪物。',
    '這是一場消耗戰，需要你擊殺至少 **{count} 隻** 怪物。',
    '工會需要你在該區域持續活動，消滅 **{count} 隻** 怪物。',
    '請徹底清掃該區域，累計擊殺 **{count} 隻** 怪物後回報。',
  ],
};

const ERRANDBOSS_TEMPLATES = {
  openings: [
    '工會確認了一頭強大的首領出沒於{area}，',
    '多名冒險者在{area}遭遇了一頭極其危險的怪物，',
    '情報部門鎖定了{area}中的首領級目標，',
    '懸賞名單上新增了一頭{area}的強敵，',
    '工會發布緊急討伐令，目標是{area}的首領，',
    '探險隊在{area}發現了一頭威脅極大的首領怪物，',
    '有目擊者回報{area}出現了首領級的強敵，',
    '工會的精英小隊在{area}偵測到強大的魔力反應，',
    '{area}的生態因為一頭首領怪物的出現而徹底失衡，',
    '高階冒險者確認{area}有首領級目標出沒，',
    '工會判定{area}的首領怪物已對周邊構成重大威脅，',
    '這是一份高風險任務——{area}的首領正在肆虐，',
  ],
  tasks: [
    '請前往擊殺 **{monster}** **{count} 次**。',
    '目標：討伐 **{monster}** **{count} 次**。',
    '你的任務是消滅 **{monster}** **{count} 次**。',
    '請狩獵 **{monster}** **{count} 次** 以解除威脅。',
    '工會需要你擊敗 **{monster}** **{count} 次**。',
    '請前往挑戰 **{monster}**，完成 **{count} 次** 討伐。',
    '目標是將 **{monster}** 擊殺 **{count} 次** 以絕後患。',
    '需要你反覆討伐 **{monster}** **{count} 次** 才能確保安全。',
  ],
};

const COLLECTBOSS_TEMPLATES = {
  openings: [
    '頂級煉金師急需首領級怪物的珍稀素材，',
    '皇家研究院正在收購首領級素材，願出高價，',
    '一位大師級工匠需要特殊的首領素材來鍛造神器，',
    '工會收到來自王都的緊急委託，需要首領級材料，',
    '學院的禁書記載了需要首領素材才能完成的秘術，',
    '傳說中的配方需要首領級怪物才有的稀有材料，',
    '附魔大師正在研究首領素材的特殊性質，',
    '軍方的秘密計畫需要首領級怪物的核心材料，',
    '皇室御用鍛冶師指名要求首領級素材，',
    '古代文獻記載的失落工藝需要首領精華，',
    '知名煉金工坊願以天價收購首領素材，',
    '工會的特級委託——收集首領級怪物的稀有掉落，',
  ],
  tasks: [
    '請擊殺 **{area}** 的 **{monster}** 收集素材 **{count} 個**。',
    '目標是從 **{monster}** 身上取得 **{count} 個** 珍稀素材。',
    '需要你狩獵 **{area}** 的 **{monster}**，採集 **{count} 個** 稀有材料。',
    '請討伐 **{monster}** 並帶回 **{count} 個** 首領素材。',
    '前往 **{area}** 擊殺 **{monster}**，收集 **{count} 個** 珍品。',
    '目標為 **{monster}** 的 **{count} 個** 稀世素材，祝你好運。',
    '請從 **{area}** 的 **{monster}** 獲取 **{count} 個** 核心材料。',
    '需要你反覆挑戰 **{monster}**，收集 **{count} 個** 珍稀掉落物。',
  ],
};

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
  switch (type) {
    case 'errand': {
      const opening = pickRandom(ERRAND_TEMPLATES.openings).replace('{area}', `**${areaName}**`);
      const task = pickRandom(ERRAND_TEMPLATES.tasks).replace('{count}', String(count));
      return opening + task;
    }
    case 'collect': {
      const opening = pickRandom(COLLECT_TEMPLATES.openings);
      const task = pickRandom(COLLECT_TEMPLATES.tasks)
        .replace('{area}', areaName)
        .replace('{monster}', monsterName ?? '')
        .replace('{count}', String(count));
      return opening + task;
    }
    case 'endurance': {
      const opening = pickRandom(ENDURANCE_TEMPLATES.openings).replace('{area}', `**${areaName}**`);
      const task = pickRandom(ENDURANCE_TEMPLATES.tasks).replace('{count}', String(count));
      return opening + task;
    }
    case 'errandboss': {
      const opening = pickRandom(ERRANDBOSS_TEMPLATES.openings).replace('{area}', `**${areaName}**`);
      const task = pickRandom(ERRANDBOSS_TEMPLATES.tasks)
        .replace('{monster}', monsterName ?? '')
        .replace('{count}', String(count));
      return opening + task;
    }
    case 'collectboss': {
      const opening = pickRandom(COLLECTBOSS_TEMPLATES.openings);
      const task = pickRandom(COLLECTBOSS_TEMPLATES.tasks)
        .replace('{area}', areaName)
        .replace('{monster}', monsterName ?? '')
        .replace('{count}', String(count));
      return opening + task;
    }
  }
}

function calculateReward(
  type: RewardType,
  baseValue: number,
): QuestReward {
  switch (type) {
    case 'gold':
      return { type: 'gold', amount: Math.floor(baseValue * 2) };
    case 'potion': {
      const potion = pickRandom(POTION_REWARDS);
      const amount = Math.max(1, Math.floor(baseValue / potion.unitPrice));
      return { type: 'potion', itemId: potion.itemId, itemName: potion.name, amount };
    }
    case 'quality-stone': {
      const item = getItem(9);
      return { type: 'quality-stone', itemId: item.id, itemName: item.name, amount: Math.max(1, Math.floor(baseValue / 100)) };
    }
    case 'enhancement-stone': {
      const item = getItem(10);
      return { type: 'enhancement-stone', itemId: item.id, itemName: item.name, amount: Math.max(1, Math.floor(baseValue / 100)) };
    }
    case 'weapon-scroll': {
      const item = getItem(7);
      return { type: 'weapon-scroll', itemId: item.id, itemName: item.name, amount: 1 };
    }
    case 'armor-scroll': {
      const item = getItem(8);
      return { type: 'armor-scroll', itemId: item.id, itemName: item.name, amount: 1 };
    }
  }
}

function generateSingleQuest(
  difficulty: AdventurerQuestDifficulty,
  guildRank: GuildRank,
  index: number,
): AdventurerQuest {
  const type = pickQuestType(difficulty);
  let targetArea: string;
  let areaName: string;
  let targetMonster: string | undefined;
  let targetCount: number;
  let avgGold: number;

  if (type === 'collect') {
    const monsterEntry = pickRandom(MONSTER_POOLS[difficulty]);
    targetMonster = monsterEntry.name;
    targetArea = monsterEntry.area;
    areaName = getAreaDisplayName(monsterEntry.area);
    avgGold = AREA_POOLS[difficulty].find(a => a.areaId === monsterEntry.questArea)?.avgGold ?? 50;
    targetCount = randomInt(COLLECT_TARGET_COUNT_RANGE.min, COLLECT_TARGET_COUNT_RANGE.max);
  } else if (type === 'errandboss' || type === 'collectboss') {
    const bossDifficulty = difficulty as 'B' | 'A' | 'S';
    const bossEntry = pickRandom(BOSS_POOLS[bossDifficulty]);
    targetMonster = bossEntry.name;
    targetArea = bossEntry.area;
    areaName = bossEntry.areaName;
    avgGold = bossEntry.avgGold;

    if (type === 'errandboss') {
      targetCount = randomInt(BOSS_KILL_COUNT_RANGE.min, BOSS_KILL_COUNT_RANGE.max);
    } else {
      targetCount = randomInt(1, BOSS_COLLECT_TARGET_COUNT);
    }
  } else {
    const areaEntry = pickRandom(AREA_POOLS[difficulty]);
    targetArea = areaEntry.areaId;
    areaName = areaEntry.areaName;
    avgGold = areaEntry.avgGold;

    if (type === 'errand') {
      const range = KILL_COUNT_RANGE[difficulty];
      targetCount = randomInt(range.min, range.max);
    } else {
      const range = ENDURANCE_COUNT_RANGE[difficulty];
      targetCount = randomInt(range.min, range.max);
    }
  }

  const isBossQuest = type === 'errandboss' || type === 'collectboss';
  const baseValue = isBossQuest ? avgGold * targetCount * 3 : avgGold * targetCount;
  const rewardWeights = REWARD_WEIGHTS[guildRank];
  const rewardType = weightedPick(rewardWeights).type;
  const rewardMultiplier = guildRank === 'US' ? 10 : (isBossQuest ? 2 : 1);
  const reward = calculateReward(rewardType, baseValue * rewardMultiplier);
  const baseContribution = CONTRIBUTION_POINTS[difficulty][type];
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
): AdventurerQuest[] {
  const count = randomInt(5, 8);
  const quests: AdventurerQuest[] = [];
  for (let i = 0; i < count; i++) {
    quests.push(generateSingleQuest(difficulty, guildRank, i));
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
