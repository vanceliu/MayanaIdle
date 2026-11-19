import type { Character } from '../models/character';

/** 等級硬上限（`04-character.md` § 4.9）：到達後經驗照常累積，不再升級；Lv100 起為軟上限區（每級 ×1.3） */
export const LEVEL_CAP = 120;

/**
 * 經驗曲線（§ 4.9）：底數固定 100 × 1.15^k，指數 k 的每級推進量分三段。
 * 錨點 —— Lv1 = 100、Lv65 = 3,101,988、Lv99 = 102,114,213；Lv99 起每級 ×1.3。
 */
const EXP_PIVOT_LEVEL = 65;
const EXP_EXPONENT_AT_PIVOT = 74;
const EXP_STEP_EARLY = EXP_EXPONENT_AT_PIVOT / (EXP_PIVOT_LEVEL - 1); // 1.15625
const EXP_STEP_LATE = 25 / 34;                                        // 0.73529
const EXP_TOP_LEVEL = 99;
const EXP_EXPONENT_AT_TOP = 99;
const EXP_STEP_TOP = Math.log(1.3) / Math.log(1.15);                  // 1.87720，每級 ×1.3

export function getExpToNextLevel(level: number): number {
  const exponent = level <= EXP_PIVOT_LEVEL
    ? EXP_STEP_EARLY * (level - 1)
    : level <= EXP_TOP_LEVEL
      ? EXP_EXPONENT_AT_PIVOT + EXP_STEP_LATE * (level - EXP_PIVOT_LEVEL)
      : EXP_EXPONENT_AT_TOP + EXP_STEP_TOP * (level - EXP_TOP_LEVEL);
  return Math.floor(100 * Math.pow(1.15, exponent));
}

/** 升級；HP/MP 回滿由呼叫端以有效最大值處理（`20-attributes.md` § 20.4） */
export function tryLevelUp(char: Character): Character {
  if (char.level >= LEVEL_CAP || char.exp < char.expToNext) return char;

  const updated = { ...char };
  updated.exp -= updated.expToNext;
  updated.level += 1;
  updated.expToNext = getExpToNextLevel(updated.level);
  return tryLevelUp(updated);
}

export function addExp(char: Character, amount: number): Character {
  const updated = { ...char, exp: char.exp + amount };
  return tryLevelUp(updated);
}
