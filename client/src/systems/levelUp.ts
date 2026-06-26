import type { Character } from '../models/character';
import { getTotalAttributes, LEVELUP_ATTRIBUTE_START_LEVEL } from '../models/character';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const INITIAL_HP = 30;
export const INITIAL_MP = 10;

export function getExpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.15, level - 1));
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

  // Attribute point at level 51+
  if (updated.level > LEVELUP_ATTRIBUTE_START_LEVEL) {
    updated.unspentAttributePoints = (updated.unspentAttributePoints ?? 0) + 1;
  }

  // Recursive check for multi-level
  return tryLevelUp(updated);
}

export function addExp(char: Character, amount: number): Character {
  const updated = { ...char, exp: char.exp + amount };
  return tryLevelUp(updated);
}
