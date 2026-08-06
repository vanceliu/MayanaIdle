import type { PlayerDebuffType } from './playerDebuff';

/**
 * 常駐腳本「狀態異常」條件的選項。
 * 詛咒與虛弱共用淨化藥水，因此合併為一項，避免腳本過長。
 * 暈眩不列入：無解除道具，且暈眩中無法使用任何道具。
 */
export type ScriptDebuffCondition = 'poison' | 'bleed' | 'curse_weaken' | 'slow';

/** 每個條件對應到的實際 debuff 類型 */
export const SCRIPT_DEBUFF_TYPES: Record<ScriptDebuffCondition, PlayerDebuffType[]> = {
  poison: ['poison'],
  bleed: ['bleed'],
  curse_weaken: ['curse', 'weaken'],
  slow: ['slow'],
};

export const SCRIPT_DEBUFF_LABELS: Record<ScriptDebuffCondition, string> = {
  poison: '中毒',
  bleed: '流血',
  curse_weaken: '詛咒或虛弱',
  slow: '減速',
};

// === Combat Script Types ===

export type CombatConditionType =
  | 'always'
  | 'monster_count_gte'
  | 'monster_hp_below'
  | 'monster_hp_above'
  | 'mp_above'
  | 'mp_below'
  | 'skill_ready';

export type CombatActionType = 'skill' | 'normal_attack' | 'wait';

export interface CombatCondition {
  type: CombatConditionType;
  value?: number;
  skillId?: string;
}

export interface CombatAction {
  type: CombatActionType;
  skillId?: string;
}

export interface CombatRule {
  id: string;
  enabled: boolean;
  condition: CombatCondition;
  action: CombatAction;
}

// === Persistent Script Types ===

export type PersistentConditionType =
  | 'always'
  | 'hp_below'
  | 'hp_above'
  | 'mp_below'
  | 'mp_above'
  | 'buff_not_active'
  | 'speed_not_active'
  | 'skill_ready'
  | 'debuff_active';

export type PersistentActionType = 'potion' | 'speed_potion' | 'buff_skill' | 'heal_skill' | 'cure_item';

export interface PersistentCondition {
  type: PersistentConditionType;
  value?: number;
  skillId?: string;
  /** debuff_active 用：指定狀態異常條件 */
  debuffType?: ScriptDebuffCondition;
}

export interface PersistentAction {
  type: PersistentActionType;
  potionType?: 'red' | 'orange' | 'white';
  speedPotionType?: 'green' | 'enhanced-green';
  skillId?: string;
  /** cure_item 用：狀態解除道具的 `ITEM_DEFINITIONS` id（存 id 不存名稱，改名才不會失效） */
  cureItemId?: number;
}

export interface PersistentRule {
  id: string;
  enabled: boolean;
  condition: PersistentCondition;
  action: PersistentAction;
}

// === Emergency Retreat ===

/** § 3.13：瞬移逃跑已移除，緊急撤退僅保留回城 */
export type EmergencyRetreatAction = 'flee_town';

export interface EmergencyRetreat {
  enabled: boolean;
  hpThreshold: number;
  action: EmergencyRetreatAction;
  scrollTownId?: string;
}

export const DEFAULT_EMERGENCY_RETREAT: EmergencyRetreat = {
  enabled: true,
  hpThreshold: 15,
  action: 'flee_town',
};

// === Defaults ===

export const DEFAULT_COMBAT_SCRIPT: CombatRule[] = [
  {
    id: 'rule-wind-blade',
    enabled: true,
    condition: { type: 'skill_ready', skillId: 'wind-blade' },
    action: { type: 'skill', skillId: 'wind-blade' },
  },
  {
    id: 'rule-normal-attack',
    enabled: true,
    condition: { type: 'always' },
    action: { type: 'normal_attack' },
  },
];

export const DEFAULT_PERSISTENT_SCRIPT: PersistentRule[] = [
  {
    id: 'rule-heal-potion',
    enabled: true,
    condition: { type: 'hp_below', value: 30 },
    action: { type: 'potion', potionType: 'red' },
  },
];

// === Legacy types (for migration) ===

export type ConditionType =
  | 'always'
  | 'hp_below'
  | 'hp_above'
  | 'mp_below'
  | 'mp_above'
  | 'monster_count_gte'
  | 'monster_hp_below'
  | 'monster_hp_above'
  | 'skill_ready';

export type ActionType =
  | 'skill'
  | 'potion'
  | 'flee_town'
  | 'flee_teleport'
  | 'normal_attack';

export interface ScriptCondition {
  type: ConditionType;
  value?: number;
  skillId?: string;
}

export interface ScriptAction {
  type: ActionType;
  skillId?: string;
  potionType?: 'red' | 'orange' | 'white';
  scrollTownId?: string;
}

export interface ScriptRule {
  id: string;
  enabled: boolean;
  condition: ScriptCondition;
  action: ScriptAction;
}

export const DEFAULT_SCRIPT: ScriptRule[] = [
  {
    id: 'rule-heal-potion',
    enabled: true,
    condition: { type: 'hp_below', value: 30 },
    action: { type: 'potion', potionType: 'red' },
  },
  {
    id: 'rule-flee',
    enabled: true,
    condition: { type: 'hp_below', value: 15 },
    action: { type: 'flee_town' },
  },
  {
    id: 'rule-wind-blade',
    enabled: true,
    condition: { type: 'skill_ready', skillId: 'wind-blade' },
    action: { type: 'skill', skillId: 'wind-blade' },
  },
  {
    id: 'rule-normal-attack',
    enabled: true,
    condition: { type: 'always' },
    action: { type: 'normal_attack' },
  },
];
