import { CLASS_SKILLS } from '../models/classSkills';
import type { ClassName } from '../models/character';

interface SkillBookEntry {
  /** 技能書的 `ITEM_DEFINITIONS` id。名稱一律由 id 反查（§ 99.1） */
  itemId: number;
  className: ClassName;
  level: number;
}

/**
 * 25 本職業技能書的共同掉落池。
 *
 * **由 `CLASS_SKILLS` 反推，不另維護一份清單** —— 兩份名單必然漂移，
 * 曾經就是靠人工同步技能與技能書。
 */
export const ALL_CLASS_SKILL_BOOKS: SkillBookEntry[] = CLASS_SKILLS.map(s => ({
  itemId: s.bookItemId,
  className: s.className,
  level: s.classLevel,
}));

export const SKILL_BOOK_BOSS_DROP_RATE = 0.05;
export const SKILL_BOOK_NORMAL_DROP_RATE = 0.0005;

export function getSkillBookLevel(areaLevel: number): number | null {
  if (areaLevel >= 46) return 5;
  if (areaLevel >= 43) return 4;
  if (areaLevel >= 35) return 3;
  return null;
}

/** 回傳掉落的技能書 `ITEM_DEFINITIONS` id，沒掉則 null */
export function rollClassSkillBookDrop(areaLevel: number, isBoss: boolean, dropRateMultiplier: number = 1): number | null {
  const bookLevel = getSkillBookLevel(areaLevel);
  if (bookLevel === null) return null;

  const baseDropRate = isBoss ? SKILL_BOOK_BOSS_DROP_RATE : SKILL_BOOK_NORMAL_DROP_RATE;
  const dropRate = Math.min(baseDropRate * dropRateMultiplier, 1);
  if (Math.random() >= dropRate) return null;

  const pool = ALL_CLASS_SKILL_BOOKS.filter(b => b.level === bookLevel);
  if (pool.length === 0) return null;

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx].itemId;
}
