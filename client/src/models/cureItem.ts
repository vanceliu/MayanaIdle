import type { ActiveEffect } from './effect';
import { PLAYER_DEBUFF_DEFS } from './playerDebuff';

/**
 * 狀態解除道具
 * 設計來源：docs/design/24-buff-debuff.md § 24.10.1、docs/design/30-items.md § 狀態解除道具
 */
export interface CureItemDefinition {
  name: string;
  price: number;
  weight: number;
  /** 可解除的 debuff category */
  cures: string[];
  description: string;
}

export const CURE_ITEMS: CureItemDefinition[] = [
  {
    name: '解毒藥水',
    price: 50,
    weight: 2,
    cures: [PLAYER_DEBUFF_DEFS.poison.category],
    description: '立即解除中毒',
  },
  {
    name: '止血繃帶',
    price: 50,
    weight: 2,
    cures: [PLAYER_DEBUFF_DEFS.bleed.category],
    description: '立即解除流血',
  },
  {
    name: '淨化藥水',
    price: 500,
    weight: 3,
    // 減速不列入：減速由加速效果對沖，見 24-buff-debuff.md § 24.4.6
    cures: [
      PLAYER_DEBUFF_DEFS.curse.category,
      PLAYER_DEBUFF_DEFS.weaken.category,
    ],
    description: '解除詛咒/虛弱（全解）',
  },
];

const CURE_ITEM_MAP = new Map(CURE_ITEMS.map(c => [c.name, c]));

export function getCureItem(name: string): CureItemDefinition | undefined {
  return CURE_ITEM_MAP.get(name);
}

export function isCureItem(name: string): boolean {
  return CURE_ITEM_MAP.has(name);
}

/** 角色身上是否有該道具可解除的 debuff（無對應狀態時不可使用） */
export function hasCurableDebuff(
  def: CureItemDefinition,
  activeEffects: ActiveEffect[],
  now: number = Date.now(),
): boolean {
  return activeEffects.some(
    e => e.type === 'debuff' && e.target === 'player'
      && def.cures.includes(e.category)
      && now < e.startTime + e.duration
  );
}
