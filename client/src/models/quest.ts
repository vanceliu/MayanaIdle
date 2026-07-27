import type { ClassName } from './character';
import { MONSTER_SEEDS } from '../db/seed';

function getMonstersByArea(areaId: string): string[] {
  return MONSTER_SEEDS.filter(m => m.area === areaId && !m.isBoss).map(m => m.name);
}

export type QuestType = 'errand' | 'collect';
export type QuestStatus = 'available' | 'active' | 'completable' | 'completed';

export interface Quest {
  id: string;
  type: QuestType;
  className: ClassName;
  skillLevel: number;
  requiredLevel: number;
  status: QuestStatus;
  targetArea?: string;
  targetMonster?: string;
  killCount?: number;
  materialCount?: number;
}

export interface QuestTemplate {
  id: string;
  type: QuestType;
  className: ClassName;
  skillLevel: number;
  requiredLevel: number;
  rewardItemName: string;
}

const CLASS_NAMES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];

export const CLASS_SKILL_BOOK_NAMES: Record<ClassName, { level1: string; level2: string }> = {
  knight: { level1: '盾擊技能書', level2: '裂傷斬技能書' },
  elf: { level1: '精準射擊技能書', level2: '火矢附魔技能書' },
  elementalist: { level1: '冷卻縮減技能書', level2: '魔力奪取技能書' },
  priest: { level1: '聖光護盾技能書', level2: '高階治癒技能書' },
  thief: { level1: '淬毒技能書', level2: '致命一擊技能書' },
};

export const QUEST_TEMPLATES: QuestTemplate[] = CLASS_NAMES.flatMap(className => [
  {
    id: `${className}-skill-1`,
    type: 'errand' as QuestType,
    className,
    skillLevel: 1,
    requiredLevel: 10,
    rewardItemName: CLASS_SKILL_BOOK_NAMES[className].level1,
  },
  {
    id: `${className}-skill-2`,
    type: 'collect' as QuestType,
    className,
    skillLevel: 2,
    requiredLevel: 20,
    rewardItemName: CLASS_SKILL_BOOK_NAMES[className].level2,
  },
]);

export const ERRAND_AREA_POOL = ['green-valley', 'wind-woods'];
export const COLLECT_AREA_POOL = ['misty-swamp', 'trial-highlands', 'trial-highlands-top'];

export function pickRandomCollectMonster(): { area: string; monster: string } {
  const areaIdx = Math.floor(Math.random() * COLLECT_AREA_POOL.length);
  const area = COLLECT_AREA_POOL[areaIdx];
  const monsters = getMonstersByArea(area);
  if (monsters.length === 0) return pickRandomCollectMonster();
  const monsterIdx = Math.floor(Math.random() * monsters.length);
  return { area, monster: monsters[monsterIdx] };
}

export const ERRAND_KILL_TARGET = 20;
export const COLLECT_MATERIAL_TARGET = 2;
export const COLLECT_MATERIAL_DROP_RATE = 0.1;

export const QUEST_MATERIAL_NAME = '任務素材';

export function getQuestTemplate(className: ClassName, skillLevel: number): QuestTemplate | undefined {
  return QUEST_TEMPLATES.find(q => q.className === className && q.skillLevel === skillLevel);
}

export function isQuestAvailable(quest: Quest, characterLevel: number): boolean {
  return characterLevel >= quest.requiredLevel && quest.status === 'available';
}

export function isQuestCompletable(quest: Quest): boolean {
  if (quest.type === 'errand') {
    return (quest.killCount ?? 0) >= ERRAND_KILL_TARGET;
  }
  if (quest.type === 'collect') {
    return (quest.materialCount ?? 0) >= COLLECT_MATERIAL_TARGET;
  }
  return false;
}

export function pickRandomErrandArea(): string {
  const idx = Math.floor(Math.random() * ERRAND_AREA_POOL.length);
  return ERRAND_AREA_POOL[idx];
}
