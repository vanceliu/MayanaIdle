import type { Character } from '../models/character';
import type { Quest } from '../models/quest';
import {
  QUEST_TEMPLATES,
  ERRAND_KILL_TARGET,
  COLLECT_MATERIAL_TARGET,
  COLLECT_MATERIAL_DROP_RATE,
  pickRandomErrandArea,
  pickRandomCollectMonster,
} from '../models/quest';

export function getAvailableQuests(character: Character): Quest[] {
  const className = character.className;
  const level = character.level;
  const existingIds = new Set(character.quests.map(q => q.id));

  return QUEST_TEMPLATES
    .filter(t => t.className === className && level >= t.requiredLevel && !existingIds.has(t.id))
    .map(t => ({
      id: t.id,
      type: t.type,
      className: t.className,
      skillLevel: t.skillLevel,
      requiredLevel: t.requiredLevel,
      status: 'available' as const,
    }));
}

export function acceptQuest(character: Character, questId: string): Character {
  const template = QUEST_TEMPLATES.find(t => t.id === questId);
  if (!template) return character;
  if (template.className !== character.className) return character;
  if (character.level < template.requiredLevel) return character;

  const existing = character.quests.find(q => q.id === questId);
  if (existing) return character;

  let quest: Quest;
  if (template.type === 'errand') {
    const targetArea = pickRandomErrandArea();
    quest = {
      id: template.id,
      type: 'errand',
      className: template.className,
      skillLevel: template.skillLevel,
      requiredLevel: template.requiredLevel,
      status: 'active',
      targetArea,
      killCount: 0,
    };
  } else {
    const { area, monster } = pickRandomCollectMonster();
    quest = {
      id: template.id,
      type: 'collect',
      className: template.className,
      skillLevel: template.skillLevel,
      requiredLevel: template.requiredLevel,
      status: 'active',
      targetArea: area,
      targetMonster: monster,
      materialCount: 0,
    };
  }

  return {
    ...character,
    quests: [...character.quests, quest],
  };
}

export function updateErrandProgress(character: Character, currentArea: string, killCount: number): Character {
  const quests = character.quests.map(q => {
    if (q.type !== 'errand' || q.status !== 'active') return q;
    if (q.targetArea !== currentArea) return q;

    const newKillCount = (q.killCount ?? 0) + killCount;
    const newStatus = newKillCount >= ERRAND_KILL_TARGET ? 'completable' as const : 'active' as const;
    return { ...q, killCount: newKillCount, status: newStatus };
  });

  return { ...character, quests };
}

export function rollQuestMaterialDrop(character: Character, monsterName: string): boolean {
  const hasActiveCollectQuest = character.quests.some(
    q => q.type === 'collect' && q.status === 'active' && q.targetMonster === monsterName
  );
  if (!hasActiveCollectQuest) return false;
  return Math.random() < COLLECT_MATERIAL_DROP_RATE;
}

export function updateCollectProgress(character: Character, amount: number): Character {
  const quests = character.quests.map(q => {
    if (q.type !== 'collect' || q.status !== 'active') return q;

    const newCount = (q.materialCount ?? 0) + amount;
    const newStatus = newCount >= COLLECT_MATERIAL_TARGET ? 'completable' as const : 'active' as const;
    return { ...q, materialCount: newCount, status: newStatus };
  });

  return { ...character, quests };
}

export function completeQuest(character: Character, questId: string): { character: Character; rewardItem: string | null } {
  const quest = character.quests.find(q => q.id === questId);
  if (!quest || quest.status !== 'completable') {
    return { character, rewardItem: null };
  }

  const template = QUEST_TEMPLATES.find(t => t.id === questId);
  if (!template) return { character, rewardItem: null };

  const quests = character.quests.map(q =>
    q.id === questId ? { ...q, status: 'completed' as const } : q
  );

  return {
    character: { ...character, quests },
    rewardItem: template.rewardItemName,
  };
}

export function getActiveErrandQuests(character: Character): Quest[] {
  return character.quests.filter(q => q.type === 'errand' && q.status === 'active');
}

export function getActiveCollectQuests(character: Character): Quest[] {
  return character.quests.filter(q => q.type === 'collect' && q.status === 'active');
}

export function getCompletableQuests(character: Character): Quest[] {
  return character.quests.filter(q => q.status === 'completable');
}
