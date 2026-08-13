/**
 * v22 遷移：鑲材實例 → 天賦格欄位（`51-auto-talent.md` § 51.4.1）。
 *
 * 條件與動作改為內建之後 `talentAffixes` 整張表消失，玩家已經擺好的配置
 * 靠這張對照表原地搬進 `talentSlots.conditions` / `.action`。
 *
 * **只在 v22 的 upgrade 用。** 定義的唯一鍵已改為 `ruleId`
 * （`db/seed/talentSeeds.ts`），這裡的數字 id 是歷史包袱，不可在別處引用。
 *
 * 多階塌成完整版的（§ 51.4.1）在這裡指向同一個 `ruleId`：
 * `skill`（2003~2006）、`buff_skill`（2103／2106）、`buy_item`（2204／2214）、
 * `withdraw_item`（2205／2215）、`sell_materials`（2206／2208）、
 * `sell_equipment`（2207／2209）。
 */
export const LEGACY_AFFIX_RULE_IDS: Record<number, string> = {
  1001: 'hp_below', 1002: 'hp_above', 1003: 'mp_below', 1004: 'mp_above',
  1005: 'skill_ready', 1006: 'monsters_near_self_gte', 1007: 'buff_not_active',
  1008: 'speed_not_active', 1009: 'debuff_active', 1010: 'weapon_type_is',
  1011: 'area_dwell_gte', 1012: 'hp_dropped_recently', 1013: 'weight_over',
  1014: 'self_shielded', 1015: 'current_area_is',

  1101: 'monster_hp_below', 1102: 'monster_hp_above', 1103: 'monster_count_gte',
  1104: 'aoe_hit_count_gte', 1105: 'target_distance', 1106: 'target_attack_type',
  1107: 'target_race', 1108: 'target_element', 1109: 'target_size',
  1110: 'target_is_boss', 1111: 'target_defense', 1112: 'target_level_diff',
  1113: 'target_range_gt', 1114: 'target_has_debuff', 1115: 'target_lacks_debuff',
  1116: 'target_cc_immune', 1117: 'target_shielded', 1118: 'target_casting',
  1119: 'field_has_race', 1120: 'field_avg_hp_below', 1121: 'can_kill_target',
  1122: 'can_kill_count_gte',

  1201: 'buff_remaining_below', 1202: 'potion_cooldown_ready',

  1301: 'in_town', 1302: 'bag_slots_used_gte', 1303: 'bag_free_slots_lte',
  1304: 'item_count_below', 1305: 'gold_below', 1306: 'gold_above',
  1307: 'has_hunt_location', 1308: 'warehouse_gold_gte', 1309: 'warehouse_item_gte',

  2001: 'normal_attack', 2002: 'wait',
  2003: 'skill', 2004: 'skill', 2005: 'skill', 2006: 'skill',
  2007: 'switch_target_lowest_hp', 2008: 'switch_target_highest_hp',
  2009: 'switch_target_farthest', 2010: 'keep_distance', 2011: 'close_in',
  2012: 'disengage', 2013: 'switch_target_by_kind', 2014: 'switch_target_by_debuff',
  2015: 'switch_target_summoner', 2016: 'lock_target',

  2101: 'potion', 2102: 'heal_skill', 2103: 'buff_skill', 2104: 'speed_potion',
  2105: 'cure_item', 2106: 'buff_skill', 2107: 'use_town_scroll',
  2108: 'use_consumable', 2109: 'refill_to_percent', 2110: 'refill_all_buffs',

  2201: 'return_town', 2202: 'return_to_hunt', 2203: 'use_inn',
  2204: 'buy_item', 2205: 'withdraw_item',
  2206: 'sell_materials', 2207: 'sell_equipment',
  2208: 'sell_materials', 2209: 'sell_equipment',
  2210: 'deposit_materials', 2211: 'deposit_gold', 2212: 'withdraw_gold',
  2213: 'deposit_equipment', 2214: 'buy_item', 2215: 'withdraw_item',
};

/** 舊鑲材實例的最小形狀，只取遷移用得到的欄位 */
export interface LegacyAffixRow {
  definitionId: number;
  boundParam: string | null;
  params: Record<string, unknown> | null;
  slotId: number | null;
  slotIndex: number | null;
}

export interface MigratedSlotContent {
  conditions: ({ ruleId: string; params: Record<string, unknown> | null } | null)[];
  action: { ruleId: string; params: Record<string, unknown> | null } | null;
}

/**
 * 把一格的鑲材攤成天賦格欄位。
 *
 * `boundParam` 併回 `params.skillId` —— 舊的指定型把技能 roll 在實例上，
 * 新的形狀一律走參數（§ 51.4.1）。查不到 `ruleId` 的丟掉，
 * 那是已經不存在的定義，留著會組出無效規則。
 */
export function migrateSlotContent(
  tier: number,
  rows: LegacyAffixRow[],
): MigratedSlotContent {
  const conditions: MigratedSlotContent['conditions'] = Array.from({ length: tier }, () => null);
  let action: MigratedSlotContent['action'] = null;

  for (const row of rows) {
    const ruleId = LEGACY_AFFIX_RULE_IDS[row.definitionId];
    if (!ruleId) continue;
    const params = row.boundParam === null
      ? row.params
      : { ...(row.params ?? {}), skillId: row.boundParam };
    const entry = { ruleId, params };

    if (row.slotIndex === null) {
      action = entry;
    } else if (row.slotIndex >= 0 && row.slotIndex < tier) {
      conditions[row.slotIndex] = entry;
    }
  }

  return { conditions, action };
}
