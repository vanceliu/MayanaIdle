import type { TalentAffixDef } from '../../models/talent';

/**
 * 鑲材定義（`51-auto-talent.md` § 51.4.5~51.4.11）。共 89 筆。
 *
 * **id 是唯一的鍵**（§ 99.1 第 3、7 條）：實例、天賦格、掉落一律用它比對，
 * 不可用 `ruleId` 或名稱查 —— `ruleId` 在共用鑲材上會重複（同一條規則同時屬於
 * 戰鬥與常駐），名稱則會隨標籤常數改動。
 *
 * **標籤不在這裡**：一律經 `models/scriptEngine.ts` 與 `models/villageScript.ts`
 * 的標籤常數渲染，編輯器與 Wiki 共用同一份。
 *
 * id 分段：
 * - 1000~ 共用條件
 * - 1100~ 戰鬥專屬條件
 * - 1200~ 常駐專屬條件
 * - 1300~ 補給條件
 * - 2000~ 戰鬥專屬實作
 * - 2100~ 常駐專屬實作
 * - 2200~ 補給實作
 */
/**
 * 尚未接上判定引擎的鑲材名稱（§ 51.4.5~51.4.11 已定規格）。
 *
 * 這些 `ruleId` 還沒有型別與 evaluator，所以標籤表裡查不到。
 * 全部標 `blocked`，接上之後把這裡的項目移進 `scriptEngine.ts` 的標籤表。
 */
export const PENDING_AFFIX_LABELS: Record<string, string> = {
  target_casting: '目標正在詠唱',
  can_kill_target: '本招可擊殺目標',
  can_kill_count_gte: '本招可擊殺 ≥ N 隻',
  switch_target_summoner: '切換目標：場上的召喚本體',
};

export const TALENT_AFFIX_DEFS: TalentAffixDef[] = [
  // === 共用條件（戰鬥 ∪ 常駐）：15 筆 ===
  { id: 1001, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 1, form: 'free', ruleId: 'hp_below' },
  { id: 1002, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 1, form: 'free', ruleId: 'hp_above' },
  { id: 1003, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 1, form: 'free', ruleId: 'mp_below' },
  { id: 1004, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 1, form: 'free', ruleId: 'mp_above' },
  { id: 1005, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 1, form: 'free', ruleId: 'skill_ready' },
  { id: 1006, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 2, form: 'free', ruleId: 'monsters_near_self_gte' },
  { id: 1007, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 2, form: 'free', ruleId: 'buff_not_active' },
  { id: 1008, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 2, form: 'free', ruleId: 'speed_not_active' },
  { id: 1009, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 2, form: 'free', ruleId: 'debuff_active' },
  { id: 1010, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 3, form: 'free', ruleId: 'weapon_type_is' },
  { id: 1011, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 3, form: 'free', ruleId: 'area_dwell_gte' },
  { id: 1012, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 3, form: 'free', ruleId: 'hp_dropped_recently' },
  { id: 1013, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 3, form: 'free', ruleId: 'weight_over' },
  { id: 1014, kind: 'condition', appliesTo: ['combat', 'persistent'], tier: 3, form: 'free', ruleId: 'self_shielded' },
  // 三類型共用：不同區域回不同城，補給也用得到
  { id: 1015, kind: 'condition', appliesTo: ['combat', 'persistent', 'supply'], tier: 3, form: 'free', ruleId: 'current_area_is' },

  // === 戰鬥專屬條件：22 筆 ===
  { id: 1101, kind: 'condition', appliesTo: ['combat'], tier: 1, form: 'free', ruleId: 'monster_hp_below' },
  { id: 1102, kind: 'condition', appliesTo: ['combat'], tier: 1, form: 'free', ruleId: 'monster_hp_above' },
  { id: 1103, kind: 'condition', appliesTo: ['combat'], tier: 2, form: 'free', ruleId: 'monster_count_gte' },
  { id: 1104, kind: 'condition', appliesTo: ['combat'], tier: 3, form: 'free', ruleId: 'aoe_hit_count_gte' },
  { id: 1105, kind: 'condition', appliesTo: ['combat'], tier: 3, form: 'free', ruleId: 'target_distance' },
  { id: 1106, kind: 'condition', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'target_attack_type' },
  { id: 1107, kind: 'condition', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'target_race' },
  { id: 1108, kind: 'condition', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'target_element' },
  { id: 1109, kind: 'condition', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'target_size' },
  { id: 1110, kind: 'condition', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'target_is_boss' },
  { id: 1111, kind: 'condition', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'target_defense' },
  { id: 1112, kind: 'condition', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'target_level_diff' },
  { id: 1113, kind: 'condition', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'target_range_gt' },
  { id: 1114, kind: 'condition', appliesTo: ['combat'], tier: 5, form: 'free', ruleId: 'target_has_debuff' },
  { id: 1115, kind: 'condition', appliesTo: ['combat'], tier: 5, form: 'free', ruleId: 'target_lacks_debuff' },
  { id: 1116, kind: 'condition', appliesTo: ['combat'], tier: 5, form: 'free', ruleId: 'target_cc_immune' },
  { id: 1117, kind: 'condition', appliesTo: ['combat'], tier: 5, form: 'free', ruleId: 'target_shielded' },
  // 怪物沒有詠唱狀態，§ 51.4.4 成對原則擋住
  { id: 1118, kind: 'condition', appliesTo: ['combat'], tier: 5, form: 'free', ruleId: 'target_casting', blocked: true, blockedReason: 'monster' },
  { id: 1119, kind: 'condition', appliesTo: ['combat'], tier: 6, form: 'free', ruleId: 'field_has_race' },
  { id: 1120, kind: 'condition', appliesTo: ['combat'], tier: 6, form: 'free', ruleId: 'field_avg_hp_below' },
  { id: 1121, kind: 'condition', appliesTo: ['combat'], tier: 7, form: 'free', ruleId: 'can_kill_target', blocked: true, blockedReason: 'pending' },
  { id: 1122, kind: 'condition', appliesTo: ['combat'], tier: 7, form: 'free', ruleId: 'can_kill_count_gte', blocked: true, blockedReason: 'pending' },

  // === 常駐專屬條件：2 筆 ===
  { id: 1201, kind: 'condition', appliesTo: ['persistent'], tier: 3, form: 'free', ruleId: 'buff_remaining_below' },
  { id: 1202, kind: 'condition', appliesTo: ['persistent'], tier: 3, form: 'free', ruleId: 'potion_cooldown_ready' },

  // === 補給條件：9 筆 ===
  { id: 1301, kind: 'condition', appliesTo: ['supply'], tier: 1, form: 'free', ruleId: 'in_town' },
  { id: 1302, kind: 'condition', appliesTo: ['supply'], tier: 1, form: 'free', ruleId: 'bag_slots_used_gte' },
  { id: 1303, kind: 'condition', appliesTo: ['supply'], tier: 1, form: 'free', ruleId: 'bag_free_slots_lte' },
  // 唯一同時適用常駐的補給條件：藥水快見底時改用低階藥水（§ 51.2.1）
  { id: 1304, kind: 'condition', appliesTo: ['supply', 'persistent'], tier: 1, form: 'free', ruleId: 'item_count_below' },
  { id: 1305, kind: 'condition', appliesTo: ['supply'], tier: 2, form: 'free', ruleId: 'gold_below' },
  { id: 1306, kind: 'condition', appliesTo: ['supply'], tier: 2, form: 'free', ruleId: 'gold_above' },
  { id: 1307, kind: 'condition', appliesTo: ['supply'], tier: 2, form: 'free', ruleId: 'has_hunt_location' },
  { id: 1308, kind: 'condition', appliesTo: ['supply'], tier: 3, form: 'free', ruleId: 'warehouse_gold_gte' },
  { id: 1309, kind: 'condition', appliesTo: ['supply'], tier: 3, form: 'free', ruleId: 'warehouse_item_gte' },

  // === 戰鬥專屬實作：16 筆 ===
  { id: 2001, kind: 'action', appliesTo: ['combat'], tier: 1, form: 'free', ruleId: 'normal_attack' },
  { id: 2002, kind: 'action', appliesTo: ['combat'], tier: 1, form: 'free', ruleId: 'wait' },
  // 可選範圍階梯：綁一招 → 綁一個系別 → 職業魔法全部 → 全部已學會的
  { id: 2003, kind: 'action', appliesTo: ['combat'], tier: 1, form: 'fixed', ruleId: 'skill' },
  { id: 2004, kind: 'action', appliesTo: ['combat'], tier: 2, form: 'pool', ruleId: 'skill' },
  { id: 2005, kind: 'action', appliesTo: ['combat'], tier: 3, form: 'free', ruleId: 'skill_class_only' },
  { id: 2006, kind: 'action', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'skill' },
  { id: 2007, kind: 'action', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'switch_target_lowest_hp' },
  { id: 2008, kind: 'action', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'switch_target_highest_hp' },
  { id: 2009, kind: 'action', appliesTo: ['combat'], tier: 4, form: 'free', ruleId: 'switch_target_farthest' },
  // 移動類共用：探索途中脫離危險與戰鬥中拉開距離是同一件事
  { id: 2010, kind: 'action', appliesTo: ['combat', 'persistent'], tier: 5, form: 'free', ruleId: 'keep_distance' },
  { id: 2011, kind: 'action', appliesTo: ['combat', 'persistent'], tier: 5, form: 'free', ruleId: 'close_in' },
  { id: 2012, kind: 'action', appliesTo: ['combat', 'persistent'], tier: 5, form: 'free', ruleId: 'disengage' },
  { id: 2013, kind: 'action', appliesTo: ['combat'], tier: 6, form: 'free', ruleId: 'switch_target_by_kind' },
  { id: 2014, kind: 'action', appliesTo: ['combat'], tier: 6, form: 'free', ruleId: 'switch_target_by_debuff' },
  // 怪物沒有召喚機制，§ 51.4.4 成對原則擋住
  { id: 2015, kind: 'action', appliesTo: ['combat'], tier: 7, form: 'free', ruleId: 'switch_target_summoner', blocked: true, blockedReason: 'monster' },
  { id: 2016, kind: 'action', appliesTo: ['combat'], tier: 7, form: 'free', ruleId: 'lock_target' },

  // === 常駐專屬實作：10 筆 ===
  { id: 2101, kind: 'action', appliesTo: ['persistent'], tier: 1, form: 'free', ruleId: 'potion' },
  { id: 2102, kind: 'action', appliesTo: ['persistent'], tier: 1, form: 'free', ruleId: 'heal_skill' },
  { id: 2103, kind: 'action', appliesTo: ['persistent'], tier: 2, form: 'fixed', ruleId: 'buff_skill' },
  { id: 2104, kind: 'action', appliesTo: ['persistent'], tier: 2, form: 'free', ruleId: 'speed_potion' },
  { id: 2105, kind: 'action', appliesTo: ['persistent'], tier: 2, form: 'free', ruleId: 'cure_item' },
  { id: 2106, kind: 'action', appliesTo: ['persistent'], tier: 3, form: 'free', ruleId: 'buff_skill' },
  { id: 2107, kind: 'action', appliesTo: ['persistent'], tier: 3, form: 'free', ruleId: 'use_town_scroll' },
  { id: 2108, kind: 'action', appliesTo: ['persistent'], tier: 3, form: 'free', ruleId: 'use_consumable' },
  { id: 2109, kind: 'action', appliesTo: ['persistent'], tier: 3, form: 'free', ruleId: 'refill_to_percent' },
  { id: 2110, kind: 'action', appliesTo: ['persistent'], tier: 3, form: 'free', ruleId: 'refill_all_buffs' },

  // === 補給實作：15 筆 ===
  { id: 2201, kind: 'action', appliesTo: ['supply'], tier: 1, form: 'free', ruleId: 'return_town' },
  { id: 2202, kind: 'action', appliesTo: ['supply'], tier: 1, form: 'free', ruleId: 'return_to_hunt' },
  { id: 2203, kind: 'action', appliesTo: ['supply'], tier: 1, form: 'free', ruleId: 'use_inn' },
  { id: 2204, kind: 'action', appliesTo: ['supply'], tier: 1, form: 'pool', ruleId: 'buy_item' },
  { id: 2205, kind: 'action', appliesTo: ['supply'], tier: 1, form: 'pool', ruleId: 'withdraw_item' },
  { id: 2206, kind: 'action', appliesTo: ['supply'], tier: 2, form: 'free', ruleId: 'sell_materials_threshold_only' },
  { id: 2207, kind: 'action', appliesTo: ['supply'], tier: 2, form: 'free', ruleId: 'sell_equipment_threshold_only' },
  { id: 2208, kind: 'action', appliesTo: ['supply'], tier: 3, form: 'free', ruleId: 'sell_materials' },
  { id: 2209, kind: 'action', appliesTo: ['supply'], tier: 3, form: 'free', ruleId: 'sell_equipment' },
  { id: 2210, kind: 'action', appliesTo: ['supply'], tier: 3, form: 'free', ruleId: 'deposit_materials' },
  { id: 2211, kind: 'action', appliesTo: ['supply'], tier: 3, form: 'free', ruleId: 'deposit_gold' },
  { id: 2212, kind: 'action', appliesTo: ['supply'], tier: 3, form: 'free', ruleId: 'withdraw_gold' },
  { id: 2213, kind: 'action', appliesTo: ['supply'], tier: 4, form: 'free', ruleId: 'deposit_equipment' },
  { id: 2214, kind: 'action', appliesTo: ['supply'], tier: 4, form: 'free', ruleId: 'buy_item' },
  { id: 2215, kind: 'action', appliesTo: ['supply'], tier: 4, form: 'free', ruleId: 'withdraw_item' },
];

const DEF_BY_ID = new Map(TALENT_AFFIX_DEFS.map(d => [d.id, d]));

export function getTalentAffixDef(id: number): TalentAffixDef | undefined {
  return DEF_BY_ID.get(id);
}

/**
 * 起始配置（§ 51.7）。全職業相同：5 個 T1 格全部鑲好。
 *
 * | 格 | 類型 | 條件槽 | 實作槽 |
 * |---|---|---|---|
 * | 0 | 戰鬥 | 空 | 施放指定攻擊技能（未綁定） |
 * | 1 | 戰鬥 | 空 | 施放指定攻擊技能（未綁定） |
 * | 2 | 常駐 | HP 低於 30% | 使用藥水（紅） |
 * | 3 | 戰鬥 | 空 | 施放指定攻擊技能（未綁定） |
 * | 4 | 戰鬥 | 空 | 普通攻擊 |
 *
 * `2003` 發放時 `boundParam` 為 null，首次鑲入時由玩家選定。
 * 不發「技能就緒」鑲材：CD／MP／武器需求由動作本身檢查（`03-combat.md` § 3.12）。
 */
export interface StartingAffixPlacement {
  definitionId: number;
  /** 鑲到第幾個起始天賦格 */
  slotIndex: number;
  /** 條件槽 index；null ＝ 實作槽 */
  conditionIndex: number | null;
  params: Record<string, unknown> | null;
}

/**
 * 起始配置（§ 51.7）：戰鬥 3 條施放技能 ＋ 1 條普通攻擊，常駐 1 條喝藥，五格用滿。
 * 三份施放技能都是未綁定的指定型，首次鑲入時才選技能。
 */
export const STARTING_LAYOUT: StartingAffixPlacement[] = [
  { definitionId: 2003, slotIndex: 0, conditionIndex: null, params: null },
  { definitionId: 2003, slotIndex: 1, conditionIndex: null, params: null },
  { definitionId: 1001, slotIndex: 2, conditionIndex: 0, params: { value: 30 } },
  { definitionId: 2101, slotIndex: 2, conditionIndex: null, params: { potionType: 'red' } },
  { definitionId: 2003, slotIndex: 3, conditionIndex: null, params: null },
  { definitionId: 2001, slotIndex: 4, conditionIndex: null, params: null },
];

/** 起始天賦格各自指派給哪個類型（格 2 是常駐的喝藥規則，其餘都是戰鬥） */
export const STARTING_SLOT_TYPES = ['combat', 'combat', 'persistent', 'combat', 'combat'] as const;
