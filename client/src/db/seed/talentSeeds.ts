import type { TalentRuleDef, TalentSlotEntry, TalentType } from '../../models/talent';

/**
 * 條件與動作的定義（`51-auto-talent.md` § 51.4.5~51.4.11）。共 81 筆，**全部內建**。
 *
 * **`ruleId` 是唯一的鍵**（§ 99.1 第 3、7 條）：天賦格存的就是它，不可用名稱查。
 * 能力階梯塌成完整版之後 `ruleId` 不再重複（§ 51.4.1）——
 * `skill`、`buff_skill`、`buy_item`、`withdraw_item`、`sell_materials`、
 * `sell_equipment` 原本各有兩到三階，現在各只有一筆完整版。
 *
 * **標籤不在這裡**：一律經 `models/scriptEngine.ts` 與 `models/villageScript.ts`
 * 的標籤常數渲染，編輯器與 Wiki 共用同一份。
 *
 * `group` 只決定選單分區（§ 51.4.2），**不是 tier、不是門檻**。
 */

/**
 * 尚未接上判定引擎的項目名稱（§ 51.4.5~51.4.11 已定規格）。
 *
 * 這些 `ruleId` 還沒有型別與 evaluator，所以標籤表裡查不到。
 * 全部標 `blocked`，接上之後把這裡的項目移進 `scriptEngine.ts` 的標籤表。
 */
export const PENDING_RULE_LABELS: Record<string, string> = {
  can_kill_target: '本招可擊殺目標',
  can_kill_count_gte: '本招可擊殺 ≥ N 隻',
  switch_target_summoner: '切換目標：場上的召喚本體',
};

const COMBAT_PERSISTENT: TalentType[] = ['combat', 'persistent'];
const COMBAT: TalentType[] = ['combat'];
const PERSISTENT: TalentType[] = ['persistent'];
const SUPPLY: TalentType[] = ['supply'];

export const TALENT_RULE_DEFS: TalentRuleDef[] = [
  // === 共用條件（戰鬥 ∪ 常駐）：15 筆 ===
  { ruleId: 'hp_below', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'vitals' },
  { ruleId: 'hp_above', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'vitals' },
  { ruleId: 'mp_below', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'vitals' },
  { ruleId: 'mp_above', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'vitals' },
  { ruleId: 'hp_dropped_recently', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'vitals' },
  { ruleId: 'skill_ready', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'self' },
  { ruleId: 'buff_not_active', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'self' },
  { ruleId: 'speed_not_active', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'self' },
  { ruleId: 'debuff_active', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'self' },
  { ruleId: 'self_shielded', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'self' },
  { ruleId: 'weapon_type_is', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'gear' },
  { ruleId: 'weight_over', kind: 'condition', appliesTo: ['combat', 'persistent', 'supply'], group: 'gear' },
  { ruleId: 'monsters_near_self_gte', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'surroundings' },
  { ruleId: 'area_dwell_gte', kind: 'condition', appliesTo: COMBAT_PERSISTENT, group: 'surroundings' },
  // 三類型共用：不同區域回不同城，補給也用得到
  { ruleId: 'current_area_is', kind: 'condition', appliesTo: ['combat', 'persistent', 'supply'], group: 'location' },

  // === 戰鬥專屬條件：22 筆 ===
  { ruleId: 'monster_hp_below', kind: 'condition', appliesTo: COMBAT, group: 'target_hp' },
  { ruleId: 'monster_hp_above', kind: 'condition', appliesTo: COMBAT, group: 'target_hp' },
  { ruleId: 'target_attack_type', kind: 'condition', appliesTo: COMBAT, group: 'target_identity' },
  { ruleId: 'target_race', kind: 'condition', appliesTo: COMBAT, group: 'target_identity' },
  { ruleId: 'target_element', kind: 'condition', appliesTo: COMBAT, group: 'target_identity' },
  { ruleId: 'target_size', kind: 'condition', appliesTo: COMBAT, group: 'target_identity' },
  { ruleId: 'target_is_boss', kind: 'condition', appliesTo: COMBAT, group: 'target_identity' },
  { ruleId: 'target_defense', kind: 'condition', appliesTo: COMBAT, group: 'target_identity' },
  { ruleId: 'target_level_diff', kind: 'condition', appliesTo: COMBAT, group: 'target_identity' },
  { ruleId: 'target_range_gt', kind: 'condition', appliesTo: COMBAT, group: 'target_identity' },
  { ruleId: 'target_has_debuff', kind: 'condition', appliesTo: COMBAT, group: 'target_state' },
  { ruleId: 'target_lacks_debuff', kind: 'condition', appliesTo: COMBAT, group: 'target_state' },
  { ruleId: 'target_cc_immune', kind: 'condition', appliesTo: COMBAT, group: 'target_state' },
  { ruleId: 'target_shielded', kind: 'condition', appliesTo: COMBAT, group: 'target_state' },
  { ruleId: 'target_casting', kind: 'condition', appliesTo: COMBAT, group: 'target_state' },
  { ruleId: 'target_distance', kind: 'condition', appliesTo: COMBAT, group: 'range' },
  { ruleId: 'monster_count_gte', kind: 'condition', appliesTo: COMBAT, group: 'range' },
  { ruleId: 'aoe_hit_count_gte', kind: 'condition', appliesTo: COMBAT, group: 'range' },
  { ruleId: 'field_has_race', kind: 'condition', appliesTo: COMBAT, group: 'field' },
  { ruleId: 'field_avg_hp_below', kind: 'condition', appliesTo: COMBAT, group: 'field' },
  { ruleId: 'can_kill_target', kind: 'condition', appliesTo: COMBAT, group: 'forecast', blocked: true, blockedReason: 'pending' },
  { ruleId: 'can_kill_count_gte', kind: 'condition', appliesTo: COMBAT, group: 'forecast', blocked: true, blockedReason: 'pending' },

  // === 常駐專屬條件：2 筆 ===
  { ruleId: 'buff_remaining_below', kind: 'condition', appliesTo: PERSISTENT, group: 'timing' },
  { ruleId: 'potion_cooldown_ready', kind: 'condition', appliesTo: PERSISTENT, group: 'timing' },

  // === 補給條件：9 筆 ===
  { ruleId: 'in_town', kind: 'condition', appliesTo: SUPPLY, group: 'location' },
  { ruleId: 'has_hunt_location', kind: 'condition', appliesTo: SUPPLY, group: 'location' },
  { ruleId: 'bag_slots_used_gte', kind: 'condition', appliesTo: SUPPLY, group: 'bag' },
  { ruleId: 'bag_free_slots_lte', kind: 'condition', appliesTo: SUPPLY, group: 'bag' },
  // 唯一同時適用常駐的補給條件：藥水快見底時改用低階藥水（§ 51.2.1）
  { ruleId: 'item_count_below', kind: 'condition', appliesTo: ['supply', 'persistent'], group: 'bag' },
  { ruleId: 'gold_below', kind: 'condition', appliesTo: SUPPLY, group: 'gold' },
  { ruleId: 'gold_above', kind: 'condition', appliesTo: SUPPLY, group: 'gold' },
  { ruleId: 'warehouse_gold_gte', kind: 'condition', appliesTo: SUPPLY, group: 'gold' },
  { ruleId: 'warehouse_item_gte', kind: 'condition', appliesTo: SUPPLY, group: 'gold' },

  // === 戰鬥專屬動作：13 筆 ===
  { ruleId: 'normal_attack', kind: 'action', appliesTo: COMBAT, group: 'attack' },
  { ruleId: 'wait', kind: 'action', appliesTo: COMBAT, group: 'attack' },
  // 原「指定一招 → 指定系別 → 職業魔法 → 全部」四階塌成完整版（§ 51.4.9）
  { ruleId: 'skill', kind: 'action', appliesTo: COMBAT, group: 'attack' },
  { ruleId: 'keep_distance', kind: 'action', appliesTo: COMBAT_PERSISTENT, group: 'movement' },
  { ruleId: 'close_in', kind: 'action', appliesTo: COMBAT_PERSISTENT, group: 'movement' },
  { ruleId: 'switch_target_lowest_hp', kind: 'action', appliesTo: COMBAT, group: 'targeting' },
  { ruleId: 'switch_target_highest_hp', kind: 'action', appliesTo: COMBAT, group: 'targeting' },
  { ruleId: 'switch_target_farthest', kind: 'action', appliesTo: COMBAT, group: 'targeting' },
  { ruleId: 'switch_target_by_kind', kind: 'action', appliesTo: COMBAT, group: 'targeting' },
  { ruleId: 'switch_target_by_debuff', kind: 'action', appliesTo: COMBAT, group: 'targeting' },
  // 怪物沒有召喚機制，§ 51.4.4 成對原則擋住
  { ruleId: 'switch_target_summoner', kind: 'action', appliesTo: COMBAT, group: 'targeting', blocked: true, blockedReason: 'monster' },
  { ruleId: 'lock_target', kind: 'action', appliesTo: COMBAT, group: 'targeting' },

  // === 常駐專屬動作：9 筆 ===
  { ruleId: 'potion', kind: 'action', appliesTo: PERSISTENT, group: 'healing' },
  { ruleId: 'heal_skill', kind: 'action', appliesTo: PERSISTENT, group: 'healing' },
  { ruleId: 'refill_to_percent', kind: 'action', appliesTo: PERSISTENT, group: 'healing' },
  // 原「施放特定招式」是指定型才有意義，塌陷後其範圍恰為 heal_skill ∪ buff_skill（§ 51.4.10）
  { ruleId: 'buff_skill', kind: 'action', appliesTo: PERSISTENT, group: 'buffs' },
  { ruleId: 'refill_all_buffs', kind: 'action', appliesTo: PERSISTENT, group: 'buffs' },
  { ruleId: 'speed_potion', kind: 'action', appliesTo: PERSISTENT, group: 'buffs' },
  { ruleId: 'cure_item', kind: 'action', appliesTo: PERSISTENT, group: 'consumables' },
  { ruleId: 'use_town_scroll', kind: 'action', appliesTo: PERSISTENT, group: 'consumables' },
  { ruleId: 'use_consumable', kind: 'action', appliesTo: PERSISTENT, group: 'consumables' },

  // === 補給動作：11 筆 ===
  { ruleId: 'return_town', kind: 'action', appliesTo: SUPPLY, group: 'travel' },
  { ruleId: 'return_to_hunt', kind: 'action', appliesTo: SUPPLY, group: 'travel' },
  { ruleId: 'use_inn', kind: 'action', appliesTo: SUPPLY, group: 'travel' },
  // 原池型單組版刪除，只留自選最多 3 組的完整版（§ 51.4.11）
  { ruleId: 'buy_item', kind: 'action', appliesTo: SUPPLY, group: 'restock' },
  { ruleId: 'withdraw_item', kind: 'action', appliesTo: SUPPLY, group: 'restock' },
  { ruleId: 'withdraw_gold', kind: 'action', appliesTo: SUPPLY, group: 'restock' },
  // 原「僅門檻」版刪除，只留帶保留設定的完整版（§ 51.4.11）
  { ruleId: 'sell_materials', kind: 'action', appliesTo: SUPPLY, group: 'clearout' },
  { ruleId: 'sell_equipment', kind: 'action', appliesTo: SUPPLY, group: 'clearout' },
  { ruleId: 'deposit_materials', kind: 'action', appliesTo: SUPPLY, group: 'clearout' },
  { ruleId: 'deposit_equipment', kind: 'action', appliesTo: SUPPLY, group: 'clearout' },
  { ruleId: 'deposit_gold', kind: 'action', appliesTo: SUPPLY, group: 'clearout' },
];

const DEF_BY_RULE_ID = new Map(TALENT_RULE_DEFS.map(d => [d.ruleId, d]));

export function getTalentRuleDef(ruleId: string): TalentRuleDef | undefined {
  return DEF_BY_RULE_ID.get(ruleId);
}

/**
 * 某個類型某個種類選得到的項目（§ 51.10）。
 *
 * **全部列出** —— 條件與動作一律內建，沒有「已取得／未取得」的區隔。
 * 只有 `blocked` 的不列：選得上去卻永遠不觸發（§ 51.4.3.2）。
 */
export function selectableRules(type: TalentType, kind: TalentRuleDef['kind']): TalentRuleDef[] {
  return TALENT_RULE_DEFS.filter(d => !d.blocked && d.kind === kind && d.appliesTo.includes(type));
}

/**
 * 起始配置（§ 51.7）。全職業相同：5 個 T1 格全部設定好。
 *
 * | 格 | 類型 | 條件槽 | 動作槽 |
 * |---|---|---|---|
 * | 0 | 戰鬥 | 空 | 施放攻擊技能（未選定） |
 * | 1 | 戰鬥 | 空 | 施放攻擊技能（未選定） |
 * | 2 | 常駐 | HP 低於 30% | 使用藥水（紅） |
 * | 3 | 戰鬥 | 空 | 施放攻擊技能（未選定） |
 * | 4 | 戰鬥 | 空 | 普通攻擊 |
 *
 * 施放攻擊技能發放時未選定技能，**整條規則跳過**（§ 51.3.1），
 * 玩家學會技能後自己挑，隨時可改。
 * 不設「技能就緒」條件：CD／MP／武器需求由動作本身檢查（`03-combat.md` § 3.12）。
 */
export interface StartingSlotLayout {
  type: TalentType;
  conditions: (TalentSlotEntry | null)[];
  action: TalentSlotEntry | null;
}

export const STARTING_LAYOUT: StartingSlotLayout[] = [
  { type: 'combat', conditions: [null], action: { ruleId: 'skill', params: null } },
  { type: 'combat', conditions: [null], action: { ruleId: 'skill', params: null } },
  {
    type: 'persistent',
    conditions: [{ ruleId: 'hp_below', params: { value: 30 } }],
    action: { ruleId: 'potion', params: { potionType: 'red' } },
  },
  { type: 'combat', conditions: [null], action: { ruleId: 'skill', params: null } },
  // 普通攻擊排最後：規則由上往下取第一個成立者（§ 51.7）
  { type: 'combat', conditions: [null], action: { ruleId: 'normal_attack', params: null } },
];
