import type { PlayerDebuffType } from './playerDebuff';

export type MonsterSize = 'small' | 'large';
export type ElementType = 'fire' | 'ice' | 'wind' | 'earth' | 'light' | 'dark' | 'none';
export type MonsterRace = 'normal' | 'undead' | 'demon' | 'dragon';
/**
 * 怪物攻擊型別（21-combat-formula.md § 21.16）
 * - melee：近戰物理
 * - ranged：遠程物理（投射物）
 * - magic：遠程魔法（投射物），減傷改走魔法公式（裝備防禦上限 50% + 魔法抗性）
 */
export type MonsterAttackType = 'melee' | 'ranged' | 'magic';

/** 需要射程與視線判定的攻擊型別（遠程物理與遠程魔法） */
export function isRangedAttackType(type: MonsterAttackType | undefined): boolean {
  return type === 'ranged' || type === 'magic';
}

/**
 * 怪物 debuff 能力（docs/design/25-monster-system.md § 25.8）
 * chance 為百分比基礎觸發率，依陣列順序判定、命中即停（§ 25.9.2 規則 1、2）
 */
export interface MonsterDebuffAbility {
  type: PlayerDebuffType;
  chance: number;
}

export interface MonsterTemplate {
  id?: number;
  name: string;
  level: number;
  hp: number;
  attackMin: number;
  attackMax: number;
  defense: number;
  exp: number;
  race: MonsterRace;
  size: MonsterSize;
  element: ElementType;
  area: string;
  isBoss: boolean;
  attackType?: MonsterAttackType;
  attackRange?: number;
  attackInterval?: number;
  projectileSpeed?: number;
  debuffs?: MonsterDebuffAbility[];
}

export interface MonsterInstance {
  templateId: number;
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  attackMin: number;
  attackMax: number;
  defense: number;
  exp: number;
  race: MonsterRace;
  size: MonsterSize;
  element: ElementType;
  isBoss: boolean;
  attackType: MonsterAttackType;
  attackRange: number;
  attackInterval: number;
  projectileSpeed?: number;
  debuffs?: MonsterDebuffAbility[];
  /** § 24.6 Boss 控場免疫：被控場後 10 秒內免疫任何控場效果（時間戳 ms） */
  ccImmuneUntil?: number;
  _processed?: boolean;
}
