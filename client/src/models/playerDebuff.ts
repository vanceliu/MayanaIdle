import type { StatModifier } from './effect';

/**
 * 角色 Debuff 系統
 * 設計來源：docs/design/24-buff-debuff.md § 24.4
 */
export type PlayerDebuffType = 'poison' | 'bleed' | 'curse' | 'weaken' | 'slow' | 'stun';

export interface PlayerDebuffDefinition {
  type: PlayerDebuffType;
  name: string;
  /** ActiveEffect.category（同 category 依疊加規則處理） */
  category: string;
  /** ActiveEffect.tags 標記 */
  tag: string;
  /** 持續時間（ms） */
  duration: number;
  /** true = 獨立計時不可刷新；false = 後施放覆蓋前者 */
  refreshable: boolean;
  /** DoT：每跳傷害為「怪物攻擊力 × dotPercent」 */
  dotPercent?: number;
  dotElement?: 'poison' | 'physical';
  dotInterval?: number;
  modifiers?: StatModifier[];
  stun?: boolean;
  description: string;
}

/** § 24.4.1 Debuff 類型定義 */
export const PLAYER_DEBUFF_DEFS: Record<PlayerDebuffType, PlayerDebuffDefinition> = {
  poison: {
    type: 'poison',
    name: '中毒',
    category: 'dot-poison',
    tag: 'poisoned',
    duration: 10000,
    refreshable: false,
    dotPercent: 0.05,
    dotElement: 'poison',
    dotInterval: 1000,
    description: '每秒受到怪物攻擊力 5% 的傷害',
  },
  bleed: {
    type: 'bleed',
    name: '流血',
    category: 'dot-bleed',
    tag: 'bleeding',
    duration: 10000,
    refreshable: false,
    dotPercent: 0.08,
    dotElement: 'physical',
    dotInterval: 1000,
    description: '每秒受到怪物攻擊力 8% 的傷害',
  },
  curse: {
    type: 'curse',
    name: '詛咒',
    category: 'curse',
    tag: 'cursed',
    duration: 8000,
    refreshable: true,
    modifiers: [{ stat: 'defense', value: -20, isPercent: true }],
    description: '防禦力 -20%',
  },
  weaken: {
    type: 'weaken',
    name: '虛弱',
    category: 'weaken',
    tag: 'weakened',
    duration: 8000,
    refreshable: true,
    modifiers: [{ stat: 'attack', value: -20, isPercent: true }],
    description: '攻擊力 -20%',
  },
  slow: {
    type: 'slow',
    name: '減速',
    category: 'slow',
    tag: 'slowed',
    duration: 6000,
    refreshable: true,
    modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }],
    description: '攻擊速度 -30%',
  },
  stun: {
    type: 'stun',
    name: '暈眩',
    category: 'stun',
    tag: 'stunned',
    duration: 1500,
    refreshable: false,
    stun: true,
    description: '無法行動，攻擊計時器暫停',
  },
};

export const PLAYER_DEBUFF_TYPES: PlayerDebuffType[] = ['poison', 'bleed', 'curse', 'weaken', 'slow', 'stun'];

export const PLAYER_DEBUFF_CATEGORIES: string[] = PLAYER_DEBUFF_TYPES.map(t => PLAYER_DEBUFF_DEFS[t].category);

export function getPlayerDebuffDef(type: PlayerDebuffType): PlayerDebuffDefinition {
  return PLAYER_DEBUFF_DEFS[type];
}

/** 依 category 反查定義（BuffBar / 解除道具用） */
export function getPlayerDebuffDefByCategory(category: string): PlayerDebuffDefinition | undefined {
  return PLAYER_DEBUFF_TYPES.map(t => PLAYER_DEBUFF_DEFS[t]).find(d => d.category === category);
}
