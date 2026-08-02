import type { Skill } from './skill';
import type { Quest } from './quest';
import type { ActiveEffect } from './effect';
import type { EquipmentInstance } from './equipment';

export type ClassName = 'knight' | 'elf' | 'elementalist' | 'priest' | 'thief';

export interface Attributes {
  STR: number;
  AGI: number;
  VIT: number;
  SPI: number;
  INT: number;
  CHA: number;
}

export const ATTRIBUTE_KEYS: (keyof Attributes)[] = ['STR', 'AGI', 'VIT', 'SPI', 'INT', 'CHA'];

/**
 * 已裝備部位提供的單一屬性加總（`06-equipment.md` § 6.8「增加額外屬性」）。
 * 資料來源為模板的 `bonusAttributes`；`bonusStats` 只是顯示字串，不參與計算。
 */
export function getGearAttributeBonus(
  equippedGear: (EquipmentInstance | null)[],
  attr: keyof Attributes,
): number {
  let total = 0;
  for (const item of equippedGear) {
    total += item?.bonusAttributes?.[attr] ?? 0;
  }
  return total;
}

export interface Character {
  id?: number;
  /**
   * 全球唯一識別碼（crypto.randomUUID()），排行榜以此為 key。
   * 不可改用 `id` —— 那是 IndexedDB 自增值，每個玩家的第一隻角色都是 1，
   * 上傳後會在 D1 互相覆蓋（見 `docs/design/37-statistics.md` § 37.4.2）。
   * 選填是為了相容 DB v12 以前建立的舊角色，v12 upgrade 會補發。
   */
  uuid?: string;
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

/**
 * 角色總屬性 = 建角基礎 + 配點 + **裝備額外屬性** + buff。
 *
 * `equippedGear` 為選填：
 * - **要傳**：戰鬥、回復、狀態面板 —— 裝備額外屬性必須生效
 * - **不要傳**：配點上限檢查（`ATTRIBUTE_CAP` 只約束 base + bonus，見 `20-attributes.md` § 20.9）
 *   與升級 HP/MP 成長（避免升級前換 +VIT 裝的刷血漏洞，見 § 20.10）
 */
export function getTotalAttributes(
  char: Character,
  activeEffects?: ActiveEffect[],
  equippedGear?: (EquipmentInstance | null)[],
): Attributes {
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

  if (equippedGear) {
    for (const key of ATTRIBUTE_KEYS) {
      attrs[key] += getGearAttributeBonus(equippedGear, key);
    }
  }

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
