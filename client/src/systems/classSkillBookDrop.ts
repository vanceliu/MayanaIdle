import type { ClassName } from '../models/character';

interface SkillBookEntry {
  name: string;
  className: ClassName;
  level: number;
}

export const ALL_CLASS_SKILL_BOOKS: SkillBookEntry[] = [
  // Knight
  { name: '盾擊技能書', className: 'knight', level: 1 },
  { name: '裂傷斬技能書', className: 'knight', level: 2 },
  { name: '鋼鐵護盾技能書', className: 'knight', level: 3 },
  { name: '挑釁怒吼技能書', className: 'knight', level: 4 },
  { name: '復仇之刃技能書', className: 'knight', level: 5 },
  // Elf
  { name: '精準射擊技能書', className: 'elf', level: 1 },
  { name: '火矢附魔技能書', className: 'elf', level: 2 },
  { name: '三連射技能書', className: 'elf', level: 3 },
  { name: '鷹眼技能書', className: 'elf', level: 4 },
  { name: '穿透箭雨技能書', className: 'elf', level: 5 },
  // Elementalist
  { name: '冷卻縮減技能書', className: 'elementalist', level: 1 },
  { name: '魔力奪取技能書', className: 'elementalist', level: 2 },
  { name: '元素增幅技能書', className: 'elementalist', level: 3 },
  { name: '連鎖詠唱技能書', className: 'elementalist', level: 4 },
  { name: '元素風暴技能書', className: 'elementalist', level: 5 },
  // Priest
  { name: '聖光護盾技能書', className: 'priest', level: 1 },
  { name: '高階治癒技能書', className: 'priest', level: 2 },
  { name: '群體治癒技能書', className: 'priest', level: 3 },
  { name: '聖光審判技能書', className: 'priest', level: 4 },
  { name: '神聖領域技能書', className: 'priest', level: 5 },
  // Thief
  { name: '淬毒技能書', className: 'thief', level: 1 },
  { name: '致命一擊技能書', className: 'thief', level: 2 },
  { name: '煙霧彈技能書', className: 'thief', level: 3 },
  { name: '精準打擊技能書', className: 'thief', level: 4 },
  { name: '背刺技能書', className: 'thief', level: 5 },
];

export const SKILL_BOOK_BOSS_DROP_RATE = 0.05;
export const SKILL_BOOK_NORMAL_DROP_RATE = 0.0005;

export function getSkillBookLevel(areaLevel: number): number | null {
  if (areaLevel >= 46) return 5;
  if (areaLevel >= 43) return 4;
  if (areaLevel >= 35) return 3;
  return null;
}

export function rollClassSkillBookDrop(areaLevel: number, isBoss: boolean): string | null {
  const bookLevel = getSkillBookLevel(areaLevel);
  if (bookLevel === null) return null;

  const dropRate = isBoss ? SKILL_BOOK_BOSS_DROP_RATE : SKILL_BOOK_NORMAL_DROP_RATE;
  if (Math.random() >= dropRate) return null;

  const pool = ALL_CLASS_SKILL_BOOKS.filter(b => b.level === bookLevel);
  if (pool.length === 0) return null;

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx].name;
}
