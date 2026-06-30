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
  | 'skill_ready';

export type PersistentActionType = 'potion' | 'speed_potion' | 'buff_skill' | 'heal_skill';

export interface PersistentCondition {
  type: PersistentConditionType;
  value?: number;
  skillId?: string;
}

export interface PersistentAction {
  type: PersistentActionType;
  potionType?: 'red' | 'orange' | 'white';
  speedPotionType?: 'green' | 'enhanced-green';
  skillId?: string;
}

export interface PersistentRule {
  id: string;
  enabled: boolean;
  condition: PersistentCondition;
  action: PersistentAction;
}

// === Emergency Retreat ===

export type EmergencyRetreatAction = 'flee_town' | 'flee_teleport';

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
