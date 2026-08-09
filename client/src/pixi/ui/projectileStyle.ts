import type { ElementType, MonsterAttackType } from '../../models/monster';

/**
 * 投射物的外型（§ 42.4）。
 *
 * `lance` 是冰槍那類的長槍 —— 同樣是飛過去的一顆東西，只是拉長了。
 */
export type ProjectileShape = 'circle' | 'arrow' | 'lance';

/**
 * 投射物外型規則（42-element-system.md § 42.4）
 *
 * 顏色**只看攻擊元素**，不分敵我 —— 玩家與怪物的同元素攻擊是同一個顏色。
 * 物理普攻沒有元素，因此一律白色（玩家的弓、怪物弓箭手的箭矢都是白箭）。
 */

/** 無元素投射物顏色（白）。物理普攻與 `element: 'none'` 共用 */
export const NO_ELEMENT_PROJECTILE_COLOR = 0xffffff;

/** 元素 → 投射物顏色（§ 42.4） */
export const ELEMENT_COLORS: Record<ElementType, number> = {
  fire: 0xff6600,
  ice: 0x66ccff,
  wind: 0x66ff66,
  earth: 0xcc9933,
  light: 0xffffaa,
  dark: 0x9933ff,
  none: NO_ELEMENT_PROJECTILE_COLOR,
};

/** 取元素對應的投射物顏色；無元素／未知元素一律回白 */
export function getElementProjectileColor(element: ElementType | string | undefined): number {
  if (!element) return NO_ELEMENT_PROJECTILE_COLOR;
  return ELEMENT_COLORS[element as ElementType] ?? NO_ELEMENT_PROJECTILE_COLOR;
}

/**
 * 怪物投射物的外型與顏色（§ 42.4）
 *
 * - 遠程物理（弓箭手）：箭矢外型、**白色**（物理普攻無元素）
 * - 遠程魔法（巫師／魔導系）：彈丸外型、依該怪的 `element` 上色（`none` 亦為白）
 *
 * 只在 `isRangedAttackType()` 為真時呼叫（近戰不產生投射物）。
 */
export function getMonsterProjectileStyle(
  attackType: MonsterAttackType | undefined,
  element: ElementType | undefined,
): { shape: ProjectileShape; color: number } {
  return attackType === 'magic'
    ? { shape: 'circle', color: getElementProjectileColor(element) }
    : { shape: 'arrow', color: NO_ELEMENT_PROJECTILE_COLOR };
}
