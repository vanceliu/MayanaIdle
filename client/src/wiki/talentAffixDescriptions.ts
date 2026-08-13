import { COMBAT_CONDITION_HINTS, DEFAULT_NEAR_SELF_RADIUS, SCRIPT_DEBUFF_LABELS } from '../models/scriptEngine';
import type { TalentAffixDef } from '../models/talent';

/**
 * 鑲材的功能說明（`43-wiki-system.md` § 4.12.1）。
 * 鑲材總表與自動天賦頁共用這一份，鍵是 `ruleId`。
 */

export const COMBAT_CONDITION_DESC: Record<string, string> = {
  field_has_race: '場上有活著的怪符合指定種族或元素',
  field_avg_hp_below: '場上所有活著的怪，HP 百分比的平均值',
  buff_not_active: '指定 buff 效果不存在或已過期',
  speed_not_active: '沒有任何加速效果（藥水與加速術互斥，共用同一格）',
  debuff_active: '身上有指定狀態異常',
  always: '無條件觸發',
  monster_count_gte: COMBAT_CONDITION_HINTS.monster_count_gte!,
  monsters_near_self_gte: `${COMBAT_CONDITION_HINTS.monsters_near_self_gte!}（未指定時 ${DEFAULT_NEAR_SELF_RADIUS} 碼）`,
  aoe_hit_count_gte: COMBAT_CONDITION_HINTS.aoe_hit_count_gte!,
  monster_hp_below: '當前目標的 HP 百分比。未選定目標時看距離最近的一隻',
  monster_hp_above: '當前目標的 HP 百分比。未選定目標時看距離最近的一隻',
  mp_above: '角色 MP 百分比',
  mp_below: '角色 MP 百分比',
  skill_ready: '指定攻擊技能冷卻完成、MP 足夠、武器符合需求',
  hp_below: '自身 HP 百分比',
  hp_above: '自身 HP 百分比',
  weapon_type_is: '手持武器的類型。換武器時不必重寫整份配置',
  area_dwell_gte: '在本區停留的分鐘數。怪物隨停留時間增加，這是「該撤了」的判斷依據',
  weight_over: '負重百分比。超重無法攻擊或施法',
  self_shielded: '身上有無敵效果，或護盾還有剩餘吸收量',
  current_area_is: '目前所在的區域或地區',
  target_distance: '與當前目標的距離（碼）。遠程職業拉開距離的依據',
  target_attack_type: '近戰／遠程物理／遠程魔法',
  target_race: '一般／不死／惡魔／龍',
  target_element: '火／冰／風／地／光／暗／無',
  target_size: '小怪／大怪。武器對兩者的基礎傷害不同',
  target_is_boss: '當前目標是不是 Boss',
  target_defense: '當前目標的防禦力',
  target_level_diff: '目標等級減去自身等級。正數＝目標比較高',
  target_range_gt: '當前目標的攻擊射程（碼）',
  hp_dropped_recently: '指定秒數內 HP 掉了幾個百分點。用來偵測爆發傷害',
  target_has_debuff: '當前目標身上有指定的 debuff（依 tag 比對）',
  target_lacks_debuff: '當前目標身上沒有指定的 debuff。避免 DoT 與控場技重複覆蓋',
  target_cc_immune: '當前目標處於控場免疫窗內。這時放控場技是純浪費 MP',
  target_shielded: '當前目標有無敵效果或還有護盾量',
};

export const COMBAT_ACTION_DESC: Record<string, string> = {
  skill: '對當前目標施放攻擊技能。取代該次普通攻擊，不是額外動作',
  normal_attack: '物理攻擊當前目標',
  wait: '這次攻擊機會跳過，角色原地等待',
  skill_class_only: '只放該職業的職業魔法，不含基礎魔法',
  switch_target_lowest_hp: '改打場上血量百分比最低的一隻。補刀用',
  switch_target_highest_hp: '改打血量百分比最高的一隻',
  switch_target_farthest: '改打距離最遠的一隻',
  switch_target_by_kind: '改打指定種族或元素的一隻，同類取最近的',
  switch_target_by_debuff: '改打帶著（或沒有）指定 debuff 的一隻',
  lock_target: '釘住當前目標，牠死掉或離場前不再改挑最近的',
  keep_distance: '退到指定距離外。未指定時退到武器射程邊緣',
  close_in: '貼近目標到指定距離',
  disengage: '遠離所有怪物',
};

export const PERSISTENT_CONDITION_DESC: Record<string, string> = {
  always: '無條件觸發',
  hp_below: '自身 HP 百分比',
  hp_above: '自身 HP 百分比',
  mp_below: '自身 MP 百分比',
  mp_above: '自身 MP 百分比',
  buff_not_active: '指定 buff 效果不存在或已過期',
  speed_not_active: '沒有任何加速效果（藥水與加速術互斥，共用同一格）',
  skill_ready: '指定技能冷卻完成且 MP 足夠',
  debuff_active: `身上有指定狀態：${Object.values(SCRIPT_DEBUFF_LABELS).join('／')}。暈眩不列入，暈眩中無法使用任何道具`,
  monsters_near_self_gte: '以角色為圓心、指定碼數內的怪物數，用來判斷是不是被圍住了',
  weapon_type_is: '手持武器的類型',
  area_dwell_gte: '在本區停留的分鐘數',
  weight_over: '負重百分比。超重無法攻擊或施法',
  self_shielded: '身上有無敵效果，或護盾還有剩餘吸收量',
  current_area_is: '目前所在的區域或地區',
  item_count_below: '指定道具的持有量。藥水快見底時可改用低階的',
  buff_remaining_below: '指定 buff 的剩餘秒數。用來提前續，而不是等它掉光',
  potion_cooldown_ready: '指定藥水的冷卻已經走完',
  hp_dropped_recently: '指定秒數內 HP 掉了幾個百分點。用來偵測爆發傷害',
};

export const PERSISTENT_ACTION_DESC: Record<string, string> = {
  keep_distance: '退到指定距離外。未指定時退到武器射程邊緣',
  close_in: '貼近目標到指定距離',
  disengage: '遠離所有怪物',
  use_town_scroll: '使用背包裡的回城卷軸傳送回城鎮，並記下掛機點',
  use_consumable: '使用指定的消耗品。依道具種類走各自的使用路徑',
  refill_to_percent: '每次判定喝一瓶，直到 HP 達到指定百分比。受藥水冷卻限制',
  refill_all_buffs: '依序檢查最多三個 buff，放出第一個還沒生效的',
  potion: '紅／橙／白，受各自的藥水冷卻限制',
  speed_potion: '綠色／強化綠色藥水',
  buff_skill: '施放輔助型技能（魔法盔甲、祝福武器等）',
  heal_skill: '施放回復型技能。HP 全滿時不會觸發',
  cure_item: '解毒藥水／止血繃帶／淨化藥水。沒有對應狀態時不會使用',
};

export const VILLAGE_CONDITION_DESC: Record<string, string> = {
  current_area_is: '目前所在的區域或地區',
  always: '無條件觸發',
  bag_slots_used_gte: '背包已用格數（含裝備佔格）',
  item_count_below: '指定道具的持有量',
  gold_below: '身上金幣（實際金額）',
  gold_above: '身上金幣（實際金額）',
  in_town: '角色現在站在城鎮還是野外',
  bag_free_slots_lte: '背包剩餘格數。取東西前該看的是剩餘，不是已用',
  has_hunt_location: '有沒有上次掛機點的紀錄。沒有就回不去',
  warehouse_gold_gte: '共用倉庫的金幣餘額',
  warehouse_item_gte: '倉庫裡指定道具的存量',
};

export const VILLAGE_ACTION_DESC: Record<string, string> = {
  return_town: '消耗回城卷軸。只有在野外才成立，回城前會記下掛機點',
  use_inn: '恢復 HP／MP 並解除異常狀態。HP／MP 全滿又沒有異常狀態時不會觸發',
  sell_materials_threshold_only: '只有顏色門檻，保護開關固定開啟、不吃白名單',
  sell_equipment_threshold_only: '只有顏色門檻，不吃保留條件。新手裝與裝備中的照樣不賣',
  sell_materials: '依顏色等級批量販售，可選擇保留進得了配方的素材',
  sell_equipment: '依顏色等級批量販售，可設保留條件',
  buy_item: '補到目標數量。買不起就只買買得起的量',
  deposit_materials: '依顏色等級存進共用或個人倉庫',
  deposit_equipment: '把命中篩選條件的裝備存進倉庫。沒設條件就不存',
  withdraw_item: '從倉庫補到目標數量，受倉庫存量與背包格數限制',
  deposit_gold: '身上留下指定金額，其餘存進共用倉庫',
  withdraw_gold: '從共用倉庫領到目標金額',
  return_to_hunt: '回到上次離開的座標。需要通行卷軸的區域一樣要有卷軸',
};

/**
 * 只列**真的拿得到的鑲材**（§ 51.4.4）。
 *
 * 標籤表是判定引擎的，裡面有不存在對應鑲材的項目 —— 例如「永遠」：
 * 天賦系統的條件槽留空就是永遠（§ 51.3.1），不需要也沒有這份鑲材。
 * 怪物側機制沒開的（`blocked`）同樣不列，它們現在拿不到。
 */

/** 依 `ruleId` 查說明。三種類型的鍵不重疊，合起來查即可 */
const ALL_DESC: Record<string, string> = {
  ...COMBAT_CONDITION_DESC,
  ...COMBAT_ACTION_DESC,
  ...PERSISTENT_CONDITION_DESC,
  ...PERSISTENT_ACTION_DESC,
  ...VILLAGE_CONDITION_DESC,
  ...VILLAGE_ACTION_DESC,
};

/** 尚未接上判定引擎的鑲材說明（`talentSeeds.ts` 的 `PENDING_AFFIX_LABELS`） */
const PENDING_DESC: Record<string, string> = {
  target_casting: '目標正在讀條施法',
  can_kill_target: '本招的預期傷害足以擊殺當前目標',
  can_kill_count_gte: '本招的預期傷害足以擊殺 N 隻以上',
  switch_target_summoner: '把目標切到召喚出這批小怪的本體',
};

export function affixDescription(def: TalentAffixDef): string {
  return ALL_DESC[def.ruleId] ?? PENDING_DESC[def.ruleId] ?? '';
}


