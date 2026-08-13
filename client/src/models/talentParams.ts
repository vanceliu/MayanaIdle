import { REGIONS } from './mapData';
import { ELEMENT_LABELS, RACE_LABELS } from './monster';
import { MONSTER_DEBUFF_TAG_LABELS, SCRIPT_DEBUFF_LABELS } from './scriptEngine';

/**
 * 鑲材的可調參數（`51-auto-talent.md` § 51.4.1）。
 *
 * 「有序參數一律由玩家自訂」—— 這裡宣告**每個 `ruleId` 要玩家填什麼**，
 * 編輯器照著渲染。值存在鑲材實例的 `params` 上（§ 18.9），跟著鑲材走。
 *
 * **不逐筆列 89 個**：沒有參數的鑲材（普通攻擊、不動作、在城鎮…）根本不進這張表。
 */

export type ParamSkillFilter = 'attack' | 'heal' | 'buff' | 'classMagic' | 'byTalentType';

export type ParamField =
  | { key: string; kind: 'number'; label: string; suffix?: string; min?: number; max?: number; def: number }
  | { key: string; kind: 'select'; label: string; options: readonly { value: string; label: string }[]; def: string }
  /**
   * 從角色**已學會**的技能挑。`filter` 決定列哪一類：
   *
   * | filter | 範圍 |
   * |---|---|
   * | `attack` | `type === 'attack'` |
   * | `heal` | `type === 'heal'` |
   * | `buff` | `type === 'buff'` |
   * | `classMagic` | `CLASS_SKILLS` 內的攻擊技能（§ 51.4.9 T3） |
   * | `byTalentType` | 依鑲入的分頁：戰鬥＝攻擊型、常駐＝buff ＋ 治癒（`03-combat.md` § 3.12／§ 3.13） |
   *
   * `optional` ＝ 留空不算「沒選定」，規則照樣進判定（§ 51.3.1）。
   */
  | { key: string; kind: 'skill'; label: string; filter: ParamSkillFilter; optional?: boolean }
  /** 從背包挑道具。存 id 不存名稱（§ 99.1 第 7 條） */
  | { key: string; kind: 'item'; label: string; optional?: boolean }
  | { key: string; kind: 'boolean'; label: string; def: boolean };

const PERCENT = (label: string, def: number): ParamField =>
  ({ key: 'value', kind: 'number', label, suffix: '%', min: 0, max: 100, def });

const COUNT = (label: string, def: number): ParamField =>
  ({ key: 'value', kind: 'number', label, suffix: '個', min: 1, max: 20, def });

const COMPARE: ParamField = {
  key: 'compare', kind: 'select', label: '方向', def: 'gt',
  options: [{ value: 'gt', label: '大於' }, { value: 'lt', label: '小於' }],
};

/** § 49.4 的保留條件。販售裝備（T3）與存入裝備（T4）共用同一組 */
const KEEP_FIELDS: ParamField[] = [
  { key: 'keepClassUsable', kind: 'boolean', label: '保留本職業可裝備的', def: true },
  { key: 'keepAffixTierAbove', kind: 'number', label: '詞綴 Tier 高於', min: 0, max: 7, def: 5 },
];

const POTION_OPTIONS = [
  { value: 'red', label: '紅色藥水' },
  { value: 'orange', label: '橙色藥水' },
  { value: 'white', label: '白色藥水' },
] as const;

const ELEMENT_OPTIONS = (Object.entries(ELEMENT_LABELS) as [string, string][])
  .map(([value, label]) => ({ value, label }));

const RACE_OPTIONS = (Object.entries(RACE_LABELS) as [string, string][])
  .map(([value, label]) => ({ value, label }));

/** 玩家身上的狀態異常（合併條件，`scriptEngine.ts`） */
const DEBUFF_OPTIONS = (Object.entries(SCRIPT_DEBUFF_LABELS) as [string, string][])
  .map(([value, label]) => ({ value, label }));

/** 怪物身上的 debuff：值為 `ActiveEffect.tags` 的實際字面值（§ 24.4.1 下半） */
const MONSTER_DEBUFF_OPTIONS = (Object.entries(MONSTER_DEBUFF_TAG_LABELS) as [string, string][])
  .map(([value, label]) => ({ value, label }));

/** 區域：值為 `character.currentArea` 存的 region id */
const REGION_OPTIONS = REGIONS.map(r => ({ value: r.id, label: r.name }));

/** `ruleId` → 要玩家填的欄位。沒列到的＝沒有參數 */
export const TALENT_PARAM_FIELDS: Record<string, readonly ParamField[]> = {
  // === 自身狀態 ===
  hp_below: [PERCENT('低於', 30)],
  hp_above: [PERCENT('高於', 70)],
  mp_below: [PERCENT('低於', 30)],
  mp_above: [PERCENT('高於', 40)],
  weight_over: [PERCENT('超過', 90)],
  hp_dropped_recently: [
    PERCENT('下降超過', 30),
    { key: 'radius', kind: 'number', label: '在', suffix: '秒內', min: 1, max: 10, def: 3 },
  ],
  area_dwell_gte: [{ key: 'value', kind: 'number', label: '超過', suffix: '分鐘', min: 1, max: 60, def: 10 }],
  buff_remaining_below: [
    { key: 'skillId', kind: 'skill', label: 'Buff', filter: 'buff' },
    { key: 'value', kind: 'number', label: '剩餘少於', suffix: '秒', min: 1, max: 120, def: 10 },
  ],
  potion_cooldown_ready: [{ key: 'potionType', kind: 'select', label: '藥水', options: POTION_OPTIONS, def: 'red' }],
  skill_ready: [{ key: 'skillId', kind: 'skill', label: '技能', filter: 'byTalentType' }],
  buff_not_active: [{ key: 'skillId', kind: 'skill', label: 'Buff', filter: 'buff' }],
  debuff_active: [{ key: 'debuffType', kind: 'select', label: '狀態', options: DEBUFF_OPTIONS, def: 'poison' }],
  weapon_type_is: [{
    key: 'match', kind: 'select', label: '武器', def: 'sword',
    options: [
      { value: 'sword', label: '單手劍' }, { value: 'twoHandSword', label: '雙手劍' },
      { value: 'axe', label: '單手斧' }, { value: 'twoHandAxe', label: '雙手斧' },
      { value: 'mace', label: '鈍器' }, { value: 'staff', label: '法杖' },
      { value: 'twoHandStaff', label: '雙手法杖' }, { value: 'bow', label: '弓' },
      { value: 'claw', label: '拳套' }, { value: 'dualBlade', label: '雙刀' },
    ],
  }],

  // 三類型共用（§ 51.4.5）：值為 region id，與 `character.currentArea` 同一個字
  current_area_is: [{ key: 'match', kind: 'select', label: '區域', options: REGION_OPTIONS, def: REGION_OPTIONS[0].value }],

  // === 場上與目標 ===
  monster_count_gte: [COUNT('至少', 3)],
  monsters_near_self_gte: [
    COUNT('至少', 4),
    { key: 'radius', kind: 'number', label: '半徑', suffix: '格', min: 1, max: 15, def: 3 },
  ],
  aoe_hit_count_gte: [COUNT('命中至少', 3)],
  monster_hp_below: [PERCENT('低於', 30)],
  monster_hp_above: [PERCENT('高於', 70)],
  field_avg_hp_below: [PERCENT('低於', 30)],
  can_kill_count_gte: [COUNT('至少', 2)],
  target_distance: [COMPARE, { key: 'value', kind: 'number', label: '距離', suffix: '格', min: 1, max: 20, def: 5 }],
  target_defense: [COMPARE, { key: 'value', kind: 'number', label: '防禦', min: 0, max: 200, def: 40 }],
  target_level_diff: [COMPARE, { key: 'value', kind: 'number', label: '等級差', min: -50, max: 50, def: 0 }],
  target_range_gt: [{ key: 'value', kind: 'number', label: '大於', suffix: '格', min: 1, max: 20, def: 5 }],
  target_attack_type: [{
    key: 'match', kind: 'select', label: '型別', def: 'ranged',
    options: [
      { value: 'melee', label: '近戰' },
      { value: 'ranged', label: '遠程物理' },
      { value: 'magic', label: '遠程魔法' },
    ],
  }],
  target_race: [{ key: 'match', kind: 'select', label: '種族', options: RACE_OPTIONS, def: 'undead' }],
  // `match` 同時吃種族與元素，兩者取值不重疊
  field_has_race: [{
    key: 'match', kind: 'select', label: '種族／元素', def: 'undead',
    options: [...RACE_OPTIONS, ...ELEMENT_OPTIONS],
  }],
  target_element: [{ key: 'match', kind: 'select', label: '元素', options: ELEMENT_OPTIONS, def: 'fire' }],
  target_size: [{
    key: 'match', kind: 'select', label: '體型', def: 'large',
    options: [{ value: 'small', label: '小怪' }, { value: 'large', label: '大怪' }],
  }],
  target_has_debuff: [{ key: 'match', kind: 'select', label: '狀態', options: MONSTER_DEBUFF_OPTIONS, def: 'poisoned' }],
  target_lacks_debuff: [{ key: 'match', kind: 'select', label: '狀態', options: MONSTER_DEBUFF_OPTIONS, def: 'poisoned' }],

  // === 補給條件 ===
  in_town: [{
    key: 'match', kind: 'select', label: '位置', def: 'town',
    options: [{ value: 'town', label: '在城鎮' }, { value: 'field', label: '在野外' }],
  }],
  bag_slots_used_gte: [{ key: 'value', kind: 'number', label: '已用 ≥', suffix: '格', min: 1, max: 200, def: 50 }],
  bag_free_slots_lte: [{ key: 'value', kind: 'number', label: '剩餘 ≤', suffix: '格', min: 0, max: 200, def: 5 }],
  gold_below: [{ key: 'value', kind: 'number', label: '少於', suffix: 'G', min: 0, max: 9_999_999, def: 1000 }],
  gold_above: [{ key: 'value', kind: 'number', label: '多於', suffix: 'G', min: 0, max: 9_999_999, def: 50_000 }],
  warehouse_gold_gte: [{ key: 'value', kind: 'number', label: '至少', suffix: 'G', min: 0, max: 9_999_999, def: 10_000 }],
  item_count_below: [
    { key: 'itemId', kind: 'item', label: '道具' },
    { key: 'value', kind: 'number', label: '少於', suffix: '個', min: 1, max: 999, def: 20 },
  ],
  warehouse_item_gte: [
    { key: 'itemId', kind: 'item', label: '道具' },
    { key: 'value', kind: 'number', label: '至少', suffix: '個', min: 1, max: 999, def: 1 },
  ],

  // === 動作 ===
  skill: [{ key: 'skillId', kind: 'skill', label: '技能', filter: 'attack' }],
  skill_class_only: [{ key: 'skillId', kind: 'skill', label: '職業魔法', filter: 'classMagic' }],
  potion: [{ key: 'potionType', kind: 'select', label: '藥水', options: POTION_OPTIONS, def: 'red' }],
  speed_potion: [{
    key: 'speedPotionType', kind: 'select', label: '藥水', def: 'green',
    options: [{ value: 'green', label: '綠色藥水' }, { value: 'enhanced-green', label: '強化綠色藥水' }],
  }],
  heal_skill: [{ key: 'skillId', kind: 'skill', label: '技能', filter: 'heal' }],
  buff_skill: [{ key: 'skillId', kind: 'skill', label: '技能', filter: 'buff' }],
  keep_distance: [{ key: 'distance', kind: 'number', label: '保持', suffix: '格', min: 1, max: 20, def: 8 }],
  close_in: [{ key: 'distance', kind: 'number', label: '貼近到', suffix: '格', min: 1, max: 20, def: 2 }],
  disengage: [{ key: 'distance', kind: 'number', label: '拉開', suffix: '格', min: 1, max: 20, def: 10 }],
  switch_target_by_kind: [{
    key: 'match', kind: 'select', label: '種族／元素', def: 'undead',
    options: [...RACE_OPTIONS, ...ELEMENT_OPTIONS],
  }],
  switch_target_by_debuff: [
    { key: 'match', kind: 'select', label: '狀態', options: MONSTER_DEBUFF_OPTIONS, def: 'poisoned' },
    {
      key: 'invert', kind: 'select', label: '挑', def: '',
      options: [{ value: '', label: '帶著的' }, { value: '1', label: '沒有的' }],
    },
  ],
  buy_item: [
    { key: 'itemId', kind: 'item', label: '道具' },
    { key: 'targetAmount', kind: 'number', label: '補到', suffix: '個', min: 1, max: 999, def: 100 },
  ],
  withdraw_item: [
    { key: 'itemId', kind: 'item', label: '道具' },
    { key: 'targetAmount', kind: 'number', label: '補到', suffix: '個', min: 1, max: 999, def: 100 },
  ],
  // T3 比「僅門檻」多了保護開關（§ 51.4.11）
  sell_materials: [
    { key: 'maxTier', kind: 'number', label: 'Tier 以下', min: 1, max: 7, def: 2 },
    { key: 'skipCraftMaterials', kind: 'boolean', label: '保留有用途的素材', def: true },
  ],
  sell_materials_threshold_only: [{ key: 'maxTier', kind: 'number', label: 'Tier 以下', min: 1, max: 7, def: 2 }],
  // T3 比「僅門檻」多了 § 49.4 的保留條件
  sell_equipment: [
    { key: 'maxTier', kind: 'number', label: 'Tier 以下', min: 1, max: 6, def: 3 },
    ...KEEP_FIELDS,
  ],
  sell_equipment_threshold_only: [{ key: 'maxTier', kind: 'number', label: 'Tier 以下', min: 1, max: 6, def: 3 }],
  deposit_materials: [{ key: 'maxTier', kind: 'number', label: 'Tier 以下', min: 1, max: 7, def: 7 }],
  // 保留條件是這個動作的判定依據，沒有就什麼都不存（`villageScriptRunner.ts`）
  deposit_equipment: [...KEEP_FIELDS],
  deposit_gold: [{ key: 'keepGold', kind: 'number', label: '身上留', suffix: 'G', min: 0, max: 9_999_999, def: 50_000 }],
  withdraw_gold: [{ key: 'targetAmount', kind: 'number', label: '補到', suffix: 'G', min: 0, max: 9_999_999, def: 10_000 }],
  use_consumable: [{ key: 'itemId', kind: 'item', label: '道具' }],
  cure_item: [{ key: 'cureItemId', kind: 'item', label: '解除道具' }],
  refill_to_percent: [
    { key: 'potionType', kind: 'select', label: '藥水', options: POTION_OPTIONS, def: 'red' },
    PERCENT('補到', 80),
  ],
  // 依序檢查，第一個沒生效的就放。三個上限沿用 `MULTI_GROUP_MAX`
  refill_all_buffs: [
    { key: 'skillId', kind: 'skill', label: 'Buff 1', filter: 'buff' },
    { key: 'skillId2', kind: 'skill', label: 'Buff 2', filter: 'buff', optional: true },
    { key: 'skillId3', kind: 'skill', label: 'Buff 3', filter: 'buff', optional: true },
  ],
};

export function getParamFields(ruleId: string): readonly ParamField[] {
  return TALENT_PARAM_FIELDS[ruleId] ?? [];
}

/** 鑲入時先塞預設值，玩家不必為了「能跑」而逐格填一遍 */
export function defaultParams(ruleId: string): Record<string, unknown> | null {
  const fields = getParamFields(ruleId);
  if (fields.length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'number' || f.kind === 'select') out[f.key] = f.def;
  }
  return out;
}
