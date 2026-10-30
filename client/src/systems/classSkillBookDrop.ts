import { CLASS_SKILLS } from '../models/classSkills';
import type { ClassName } from '../models/character';
import { random } from '../core/rng';

interface SkillBookEntry {
  /** 技能書的 `ITEM_DEFINITIONS` id。名稱一律由 id 反查（§ 99.1） */
  itemId: number;
  className: ClassName;
  level: number;
}

/**
 * 職業技能書的掉落池（每級一池，`23-class-magic.md` § 23.1）。
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

/** 各級技能書對應的區域 `levelMax` 區間（`23-class-magic.md` § 23.1） */
export const SKILL_BOOK_LEVEL_RANGES: readonly { level: number; min: number; max: number }[] = [
  { level: 3, min: 31, max: 40 },
  { level: 4, min: 36, max: 45 },
  { level: 5, min: 41, max: 50 },
  { level: 6, min: 51, max: 70 },
  { level: 7, min: 61, max: 80 },
];

/** 該區域掉哪幾級的技能書。區間重疊時回傳多級，由小到大 */
export function getSkillBookLevels(areaLevel: number): number[] {
  return SKILL_BOOK_LEVEL_RANGES
    .filter(r => areaLevel >= r.min && areaLevel <= r.max)
    .map(r => r.level);
}

/** 回傳掉落的技能書 `ITEM_DEFINITIONS` id；每個符合的級數各擲一次，可同時掉多本 */
export function rollClassSkillBookDrops(areaLevel: number, isBoss: boolean, dropRateMultiplier: number = 1): number[] {
  const baseDropRate = isBoss ? SKILL_BOOK_BOSS_DROP_RATE : SKILL_BOOK_NORMAL_DROP_RATE;
  const dropRate = Math.min(baseDropRate * dropRateMultiplier, 1);
  const drops: number[] = [];

  for (const bookLevel of getSkillBookLevels(areaLevel)) {
    const pool = ALL_CLASS_SKILL_BOOKS.filter(b => b.level === bookLevel);
    if (pool.length === 0) continue;
    if (random() >= dropRate) continue;
    drops.push(pool[Math.floor(random() * pool.length)].itemId);
  }
  return drops;
}
