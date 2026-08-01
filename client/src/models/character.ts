import type { Skill } from './skill';
import type { Quest } from './quest';
import type { ActiveEffect } from './effect';

export type ClassName = 'knight' | 'elf' | 'elementalist' | 'priest' | 'thief';

export interface Attributes {
  STR: number;
  AGI: number;
  VIT: number;
  SPI: number;
  INT: number;
  CHA: number;
}

export interface Character {
  id?: number;
  userId: number;
  name: string;
  className: ClassName;
  level: number;
  exp: number;
  expToNext: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  baseAttributes: Attributes;
  bonusAttributes: Attributes;
  unspentAttributePoints: number;
  gold: number;
  currentArea: string;
  currentZone: string;
  currentRegion: string;
  currentFloor: number | null;
  skills: Skill[];
  quests: Quest[];
  areaEnteredAt: number;
  createdAt: number;
  dataVersion?: number;
  mapPositionX?: number;
  mapPositionY?: number;
}

export const CLASS_BASE_ATTRIBUTES: Record<ClassName, Attributes> = {
  knight:       { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
  elf:          { STR: 14, AGI: 14, VIT: 14, SPI: 12, INT: 10, CHA: 10 },
  elementalist: { STR: 8,  AGI: 8,  VIT: 10, SPI: 14, INT: 14, CHA: 12 },
  priest:       { STR: 6,  AGI: 8,  VIT: 10, SPI: 12, INT: 18, CHA: 15 },
  thief:        { STR: 12, AGI: 14, VIT: 10, SPI: 10, INT: 12, CHA: 10 },
};

export const CLASS_TOTAL_POINTS = 80;
export const ATTRIBUTE_CAP = 35;
export const LEVELUP_ATTRIBUTE_START_LEVEL = 50;

export const CLASS_NAMES_ZH: Record<ClassName, string> = {
  knight: '騎士',
  elf: '妖精',
  elementalist: '元素師',
  priest: '牧師',
  thief: '盜賊',
};

export function getAvailablePoints(className: ClassName): number {
  const base = CLASS_BASE_ATTRIBUTES[className];
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  return CLASS_TOTAL_POINTS - total;
}

export function getTotalAttributes(char: Character, activeEffects?: ActiveEffect[]): Attributes {
  const base = char.baseAttributes;
  const bonus = char.bonusAttributes;
  const attrs: Attributes = {
    STR: base.STR + bonus.STR,
    AGI: base.AGI + bonus.AGI,
    VIT: base.VIT + bonus.VIT,
    SPI: base.SPI + bonus.SPI,
    INT: base.INT + bonus.INT,
    CHA: base.CHA + bonus.CHA,
  };

  if (activeEffects) {
    const now = Date.now();
    for (const effect of activeEffects) {
      if (effect.type !== 'buff' || effect.target !== 'player') continue;
      if (now - effect.startTime >= effect.duration) continue;
      if (!effect.modifiers) continue;
      for (const mod of effect.modifiers) {
        switch (mod.stat) {
          case 'str': attrs.STR += mod.value; break;
          case 'agility': attrs.AGI += mod.value; break;
          case 'vit': attrs.VIT += mod.value; break;
          case 'spi': attrs.SPI += mod.value; break;
          case 'int': attrs.INT += mod.value; break;
          case 'cha': attrs.CHA += mod.value; break;
        }
      }
    }
  }

  return attrs;
}

export function getEffectiveSTR(str: number): number {
  return Math.floor(str / 2) * 2;
}

export function getEffectiveAGI(agi: number): number {
  return Math.floor(agi / 3) * 3;
}

export function getEffectiveVIT(vit: number): number {
  return Math.floor(vit / 2) * 2;
}

export function getEffectiveSPI(spi: number): number {
  return Math.floor(spi / 2) * 2;
}

export function getEffectiveINT(int: number): number {
  return Math.floor(int / 2) * 2;
}

/**
 * 魔法抗性（`20-attributes.md` § 20.3：精神每 2 點 +1）。
 * 用於怪物魔法攻擊的減傷計算，見 `21-combat-formula.md` § 21.16。
 */
export function getMagicResist(spi: number): number {
  return Math.floor(getEffectiveSPI(spi) / 2);
}
