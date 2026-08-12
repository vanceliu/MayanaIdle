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
  | 'monsters_near_self_gte'
  | 'aoe_hit_count_gte'
  | 'monster_hp_below'
  | 'monster_hp_above'
  | 'mp_above'
  | 'mp_below'
  | 'skill_ready'
  // === 共用（戰鬥 ∪ 常駐），`51-auto-talent.md` § 51.4.5 ===
  | 'hp_below'
  | 'hp_above'
  | 'weapon_type_is'
  | 'area_dwell_gte'
  | 'weight_over'
  | 'self_shielded'
  | 'current_area_is'
  // === 戰鬥專屬，§ 51.4.6 ===
  | 'target_distance'
  | 'target_attack_type'
  | 'target_race'
  | 'target_element'
  | 'target_size'
  | 'target_is_boss'
  | 'target_defense'
  | 'target_level_diff'
  | 'target_range_gt'
  | 'hp_dropped_recently'
  | 'target_has_debuff'
  | 'target_lacks_debuff'
  | 'target_cc_immune'
  | 'target_shielded';

/** 數值比較方向。「目標距離 大於／小於 N」這種一條鑲材兩個方向的用它 */
export type CompareMode = 'gt' | 'lt';

export type CombatActionType =
  | 'skill'
  | 'normal_attack'
  | 'wait'
  // === `51-auto-talent.md` § 51.4.9 新增 ===
  /** 只放該職業的職業魔法（`23-class-magic.md`），可選範圍階梯的 T3 */
  | 'skill_class_only'
  | 'switch_target_lowest_hp'
  | 'switch_target_highest_hp'
  | 'switch_target_farthest'
  | 'switch_target_by_kind'
  | 'switch_target_by_debuff'
  | 'lock_target'
  | 'keep_distance'
  | 'close_in'
  | 'disengage';

/**
 * 切換目標與走位類動作。
 *
 * **這些會消耗該次出手機會**，與「不動作」同性質 —— 一個天賦格只有一個實作槽
 * （`51-auto-talent.md` § 51.3），先切目標再打就是兩格兩個 tick。
 */
export const NON_ATTACK_ACTIONS: readonly CombatActionType[] = [
  'wait',
  'switch_target_lowest_hp', 'switch_target_highest_hp', 'switch_target_farthest',
  'switch_target_by_kind', 'switch_target_by_debuff', 'lock_target',
  'keep_distance', 'close_in', 'disengage',
];

export function isNonAttackAction(type: CombatActionType): boolean {
  return NON_ATTACK_ACTIONS.includes(type);
}

export interface CombatCondition {
  type: CombatConditionType;
  value?: number;
  skillId?: string;
  /** `monsters_near_self_gte` 用：以角色為圓心的半徑（碼） */
  radius?: number;
  /** `target_distance`／`target_defense`／`target_level_diff` 用 */
  compare?: CompareMode;
  /** `weapon_type_is`／`target_attack_type`／`target_race`／`target_element`／`target_size`／`current_area_is` 用 */
  match?: string;
}

export interface CombatAction {
  type: CombatActionType;
  skillId?: string;
  /** `switch_target_by_kind`（種族／元素）／`switch_target_by_debuff`（tag）用 */
  match?: string;
  /** `switch_target_by_debuff` 用：true＝挑**沒有**該 debuff 的 */
  invert?: boolean;
  /** `keep_distance`／`close_in` 用：目標距離（碼）。未帶時用武器射程 */
  distance?: number;
}

export interface CombatRule {
  id: string;
  enabled: boolean;
  /** AND：全部成立才觸發。空陣列＝無條件（等同「永遠」） */
  conditions: CombatCondition[];
  action: CombatAction;
}

// === 顯示標籤（編輯器與 Wiki 共用同一份，改名不會走鐘）===

export const COMBAT_CONDITION_LABELS: Record<CombatConditionType, string> = {
  always: '永遠',
  monster_count_gte: '攻擊範圍內怪物數 ≥',
  monsters_near_self_gte: '自身周圍怪物數 ≥',
  aoe_hit_count_gte: '本招命中數 ≥',
  monster_hp_below: '目標 HP 低於',
  monster_hp_above: '目標 HP 高於',
  mp_above: 'MP 高於',
  mp_below: 'MP 低於',
  skill_ready: '技能就緒',
  hp_below: 'HP 低於',
  hp_above: 'HP 高於',
  weapon_type_is: '手持武器類型 ＝',
  area_dwell_gte: '在本區停留超過',
  weight_over: '負重超過',
  self_shielded: '自身無敵中／帶護盾',
  current_area_is: '所在區域 ＝',
  target_distance: '目標距離',
  target_attack_type: '目標攻擊型別 ＝',
  target_race: '目標種族 ＝',
  target_element: '目標元素 ＝',
  target_size: '目標體型 ＝',
  target_is_boss: '目標是 Boss',
  target_defense: '目標防禦',
  target_level_diff: '目標等級 － 自身',
  target_range_gt: '目標射程 大於',
  hp_dropped_recently: 'HP 在 N 秒內下降超過',
  target_has_debuff: '目標身上有指定 debuff',
  target_lacks_debuff: '目標身上沒有指定 debuff',
  target_cc_immune: '目標控場免疫中',
  target_shielded: '目標無敵中／帶護盾',
};

/** 條件的補充說明，滑鼠移上去看得到（`03-combat.md` § 3.12） */
export const COMBAT_CONDITION_HINTS: Partial<Record<CombatConditionType, string>> = {
  monster_count_gte: '以這條規則自己的射程為半徑：技能用技能射程，普通攻擊用武器射程',
  monsters_near_self_gte: '以角色為圓心、指定碼數內的活怪數，用來判斷是不是被圍住了',
  aoe_hit_count_gte: '照這條規則要放的技能實算命中幾隻。範圍技怪沒聚在一起就不放，單體技與普攻永遠是 1',
};

export const COMBAT_ACTION_LABELS: Record<CombatActionType, string> = {
  skill: '施放攻擊技能',
  normal_attack: '普通攻擊',
  wait: '不動作',
  skill_class_only: '施放職業攻擊技能',
  switch_target_lowest_hp: '切換目標：最低 HP%',
  switch_target_highest_hp: '切換目標：最高 HP%',
  switch_target_farthest: '切換目標：最遠',
  switch_target_by_kind: '切換目標：指定種族／元素',
  switch_target_by_debuff: '切換目標：帶／不帶指定 debuff',
  lock_target: '鎖定目標（目標死前不換）',
  keep_distance: '保持距離',
  close_in: '進逼',
  disengage: '脫離',
};

/** `monsters_near_self_gte` 沒填半徑時的預設值（碼） */
export const DEFAULT_NEAR_SELF_RADIUS = 3;

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
  | 'debuff_active'
  // === 共用（戰鬥 ∪ 常駐），`51-auto-talent.md` § 51.4.5 ===
  | 'monsters_near_self_gte'
  | 'weapon_type_is'
  | 'area_dwell_gte'
  | 'weight_over'
  | 'self_shielded'
  | 'current_area_is'
  // 補給 T1，適用擴大到常駐（§ 51.2.1 的唯一交集）
  | 'item_count_below'
  // === 常駐專屬，§ 51.4.7 ===
  | 'buff_remaining_below'
  | 'potion_cooldown_ready'
  | 'hp_dropped_recently';

export type PersistentActionType = 'potion' | 'speed_potion' | 'buff_skill' | 'heal_skill' | 'cure_item';

export interface PersistentCondition {
  type: PersistentConditionType;
  value?: number;
  skillId?: string;
  /** debuff_active 用：指定狀態異常條件 */
  debuffType?: ScriptDebuffCondition;
  /** `monsters_near_self_gte` 用：以角色為圓心的半徑（碼） */
  radius?: number;
  /** `weapon_type_is`／`current_area_is` 用 */
  match?: string;
  /** `item_count_below`／`potion_cooldown_ready` 用。存 id 不存名稱（§ 99.1.7） */
  itemId?: number;
  /** `potion_cooldown_ready` 用 */
  potionType?: 'red' | 'orange' | 'white';
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
  /** AND：全部成立才觸發。空陣列＝無條件（等同「永遠」） */
  conditions: PersistentCondition[];
  action: PersistentAction;
}

export const PERSISTENT_CONDITION_LABELS: Record<PersistentConditionType, string> = {
  always: '永遠',
  hp_below: 'HP 低於',
  hp_above: 'HP 高於',
  mp_below: 'MP 低於',
  mp_above: 'MP 高於',
  buff_not_active: 'Buff 未激活',
  speed_not_active: '加速未激活',
  skill_ready: '技能就緒',
  debuff_active: '狀態異常',
  monsters_near_self_gte: '自身周圍怪物數 ≥',
  weapon_type_is: '手持武器類型 ＝',
  area_dwell_gte: '在本區停留超過',
  weight_over: '負重超過',
  self_shielded: '自身無敵中／帶護盾',
  current_area_is: '所在區域 ＝',
  item_count_below: '道具數量少於',
  buff_remaining_below: 'Buff 剩餘時間少於',
  potion_cooldown_ready: '指定藥水冷卻已完成',
  hp_dropped_recently: 'HP 在 N 秒內下降超過',
};

export const PERSISTENT_ACTION_LABELS: Record<PersistentActionType, string> = {
  potion: '使用藥水',
  speed_potion: '使用加速藥水',
  buff_skill: '施放 Buff',
  heal_skill: '施放治癒',
  cure_item: '使用解除道具',
};

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
    conditions: [{ type: 'skill_ready', skillId: 'wind-blade' }],
    action: { type: 'skill', skillId: 'wind-blade' },
  },
  {
    id: 'rule-normal-attack',
    enabled: true,
    conditions: [{ type: 'always' }],
    action: { type: 'normal_attack' },
  },
];

export const DEFAULT_PERSISTENT_SCRIPT: PersistentRule[] = [
  {
    id: 'rule-heal-potion',
    enabled: true,
    conditions: [{ type: 'hp_below', value: 30 }],
    action: { type: 'potion', potionType: 'red' },
  },
];

// === 讀檔防線：形狀不對就整份重置 ===

/**
 * 舊存檔一條規則只有單一 `condition`，新格式是 `conditions` 陣列（AND）。
 * **不做欄位轉換**：只要有一條規則不是現行形狀，整份腳本重置成預設。
 * 玩家自訂的順序會消失，這是刻意接受的代價（越晚換痛的人越多）。
 *
 * 這道防線本身不可省略 —— localStorage 的舊資料不會自己過期，
 * 少了它，`evaluateCombatScript` 會直接炸在 `rule.conditions.every`。
 */
function isCurrentShape(rule: unknown): boolean {
  if (!rule || typeof rule !== 'object') return false;
  const r = rule as { id?: unknown; action?: unknown; conditions?: unknown };
  return typeof r.id === 'string' && !!r.action && Array.isArray(r.conditions);
}

export function normalizeCombatRules(rules: unknown): CombatRule[] {
  if (!Array.isArray(rules) || !rules.every(isCurrentShape)) return DEFAULT_COMBAT_SCRIPT;
  return rules as CombatRule[];
}

export function normalizePersistentRules(rules: unknown): PersistentRule[] {
  if (!Array.isArray(rules) || !rules.every(isCurrentShape)) return DEFAULT_PERSISTENT_SCRIPT;
  return rules as PersistentRule[];
}

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
