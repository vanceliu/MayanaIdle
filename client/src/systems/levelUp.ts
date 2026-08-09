import type { Attributes, Character } from '../models/character';
import { ATTRIBUTE_CAP, getTotalAttributes, LEVELUP_ATTRIBUTE_START_LEVEL } from '../models/character';

const ATTR_KEYS: (keyof Attributes)[] = ['STR', 'AGI', 'VIT', 'SPI', 'INT', 'CHA'];

/** 六項屬性是否全數達上限（§ 20.9：全滿後升級不再獲得配點） */
function isAllAttributesCapped(attrs: Attributes): boolean {
  return ATTR_KEYS.every(key => attrs[key] >= ATTRIBUTE_CAP);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const INITIAL_HP = 30;
export const INITIAL_MP = 10;

/**
 * 經驗曲線（§ 4.9）：底數固定 100 × 1.15^k，指數 k 的每級推進量分兩段。
 * 錨點 —— Lv1 = 100、Lv65 = 3,101,988、Lv99 = 102,114,213。
 * Lv100 以上沿用後段推進量（等級無硬上限）。
 */
const EXP_PIVOT_LEVEL = 65;
const EXP_EXPONENT_AT_PIVOT = 74;
const EXP_STEP_EARLY = EXP_EXPONENT_AT_PIVOT / (EXP_PIVOT_LEVEL - 1); // 1.15625
const EXP_STEP_LATE = 25 / 34;                                        // 0.73529

export function getExpToNextLevel(level: number): number {
  const exponent = level <= EXP_PIVOT_LEVEL
    ? EXP_STEP_EARLY * (level - 1)
    : EXP_EXPONENT_AT_PIVOT + EXP_STEP_LATE * (level - EXP_PIVOT_LEVEL);
  return Math.floor(100 * Math.pow(1.15, exponent));
}

export function tryLevelUp(char: Character): Character {
  if (char.exp < char.expToNext) return char;

  const updated = { ...char };
  updated.exp -= updated.expToNext;
  updated.level += 1;
  updated.expToNext = getExpToNextLevel(updated.level);

  const attrs = getTotalAttributes(updated);

  // HP growth: random(VIT - 6, VIT - 3)
  const hpGain = randomInt(Math.max(1, attrs.VIT - 6), Math.max(2, attrs.VIT - 3));
  updated.maxHp += hpGain;
  updated.hp = updated.maxHp; // Full restore on level up

  // MP growth: random(SPI - 6, SPI - 3)
  const mpGain = randomInt(Math.max(1, attrs.SPI - 6), Math.max(2, attrs.SPI - 3));
  updated.maxMp += mpGain;
  updated.mp = updated.maxMp; // Full restore on level up

  // Attribute point at level 51+ (§ 20.9: stop once all six attributes are capped)
  if (updated.level > LEVELUP_ATTRIBUTE_START_LEVEL && !isAllAttributesCapped(attrs)) {
    updated.unspentAttributePoints = (updated.unspentAttributePoints ?? 0) + 1;
  }

  // Recursive check for multi-level
  return tryLevelUp(updated);
}

export function addExp(char: Character, amount: number): Character {
  const updated = { ...char, exp: char.exp + amount };
  return tryLevelUp(updated);
}
