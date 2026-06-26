import type { ClassName } from './character';

export interface ClassMagicRestriction {
  maxLevel: number;
  maxSkills: number;
  levelRequirement: (charLevel: number) => number;
}

export const CLASS_MAGIC_RESTRICTIONS: Record<ClassName, ClassMagicRestriction> = {
  knight: {
    maxLevel: 1,
    maxSkills: 5,
    levelRequirement: (_charLevel: number) => {
      // 騎士等級 50 才能學習 1 級基礎魔法
      return _charLevel >= 50 ? 1 : 0;
    },
  },
  elf: {
    maxLevel: 6,
    maxSkills: 30,
    // 每 8 級可學習或升級
    levelRequirement: (charLevel: number) => Math.floor(charLevel / 8),
  },
  elementalist: {
    maxLevel: 10,
    maxSkills: 50,
    // 每 4 級可學習或升級
    levelRequirement: (charLevel: number) => Math.floor(charLevel / 4),
  },
  priest: {
    maxLevel: 10,
    maxSkills: 50,
    // 每 5 級可學習或升級
    levelRequirement: (charLevel: number) => Math.floor(charLevel / 5),
  },
  thief: {
    maxLevel: 4,
    maxSkills: 20,
    // 每 8 級可學習或升級
    levelRequirement: (charLevel: number) => Math.floor(charLevel / 8),
  },
};

export function getLearnableMaxLevel(className: ClassName, charLevel: number): number {
  const restriction = CLASS_MAGIC_RESTRICTIONS[className];
  const levelByProgression = restriction.levelRequirement(charLevel);
  return Math.min(levelByProgression, restriction.maxLevel);
}

export function canLearnBasicMagic(
  className: ClassName,
  charLevel: number,
  skillLevel: number,
  currentSkillCount: number,
): boolean {
  const restriction = CLASS_MAGIC_RESTRICTIONS[className];
  if (currentSkillCount >= restriction.maxSkills) return false;
  if (skillLevel > restriction.maxLevel) return false;
  const learnableLevel = getLearnableMaxLevel(className, charLevel);
  return skillLevel <= learnableLevel;
}
