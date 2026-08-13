/**
 * 自動天賦系統（`51-auto-talent.md`）
 *
 * 天賦格是規則的容器，也是**唯一的取得軸**。條件與動作一律內建（§ 51.4.1），
 * 不掉落、不合成、不綁定，只是天賦格上的欄位。
 *
 * **條件與動作本身的規格不在這裡** —— 那些仍在 `03-combat.md` § 3.12~3.13
 * 與 `49-village-script.md` § 49.2~49.3，由 `scriptEngine.ts` / `villageScript.ts`
 * 的型別與標籤常數承載。本檔只管「適用哪個類型、放在哪一格」。
 */

/** 三種天賦類型。天賦格不綁類型，條件與動作綁（§ 51.2.1） */
export type TalentType = 'combat' | 'persistent' | 'supply';

export const TALENT_TYPES: readonly TalentType[] = ['combat', 'persistent', 'supply'];

export const TALENT_TYPE_LABELS: Record<TalentType, string> = {
  combat: '戰鬥',
  persistent: '常駐',
  supply: '補給',
};

export type TalentRuleKind = 'condition' | 'action';

/** 天賦格 tier ＝ 條件槽數（§ 51.3）。**tier 只存在於天賦格**（§ 51.4.2） */
export type TalentSlotTier = 1 | 2 | 3 | 4;

/** 天賦格 tier → 條件槽數。動作槽恆為 1 */
export function conditionSlotCount(tier: TalentSlotTier): number {
  return tier;
}

/**
 * 選單分區（§ 51.4.2）。**不是 tier，不是門檻**，純粹是選單的分區依據。
 * 陣列順序即選單的分區順序。
 */
export const TALENT_GROUPS = [
  'vitals', 'self', 'gear', 'surroundings', 'location',
  'target_hp', 'target_identity', 'target_state', 'range', 'field', 'forecast',
  'timing', 'bag', 'gold',
  'attack', 'movement', 'targeting',
  'healing', 'buffs', 'consumables',
  'travel', 'restock', 'clearout',
] as const;
export type TalentGroup = typeof TALENT_GROUPS[number];

export const TALENT_GROUP_LABELS: Record<TalentGroup, string> = {
  vitals: '生命與魔力',
  self: '自身狀態',
  gear: '裝備與負重',
  surroundings: '周遭',
  location: '位置',
  target_hp: '目標血量',
  target_identity: '目標身分',
  target_state: '目標狀態',
  range: '距離與命中',
  field: '戰場',
  forecast: '出手預測',
  timing: '時效',
  bag: '背包',
  gold: '金幣與倉庫',
  attack: '攻擊',
  movement: '走位',
  targeting: '切換目標',
  healing: '治癒與藥水',
  buffs: '增益',
  consumables: '道具',
  travel: '移動',
  restock: '補貨',
  clearout: '出清',
};

/**
 * 條件／動作的定義（靜態 seed，`18-data-schema.md` § 18.9）。
 *
 * **全部內建，沒有實例表** —— 玩家不「持有」條件與動作（§ 51.5）。
 * `ruleId` 是唯一的鍵：能力階梯塌成完整版之後不再重複（§ 51.4.1）。
 * **標籤不存在這裡** —— 一律經 `models` 既有的標籤常數渲染，
 * 編輯器與 Wiki 共用同一份（§ 43.4.12）。
 */
export interface TalentRuleDef {
  ruleId: string;
  kind: TalentRuleKind;
  /** 適用類型，可多選（§ 51.2.1） */
  appliesTo: TalentType[];
  group: TalentGroup;
  /**
   * 尚未接上判定引擎。帶這個旗標的**不出現在選單**（§ 51.4.3.2）——
   * 選得上去卻永遠不觸發，玩家只會覺得那條規則寫錯了。
   */
  blocked?: boolean;
  /**
   * `monster`：怪物側機制未做，不可先行實作（§ 51.4.4 成對原則）
   * `pending`：判定引擎還沒接上（§ 51.4.3.2）
   */
  blockedReason?: 'monster' | 'pending';
}

/**
 * 放在槽位上的一筆條件或動作（`18-data-schema.md` § 18.9）。
 *
 * **不是實體。** 同一個 `ruleId` 可出現在任意多個天賦格，各自帶不同 `params`
 * （§ 51.5.1）。`params` 內的技能與道具指涉一律存 id（§ 99.1 第 7 條）。
 */
export interface TalentSlotEntry {
  ruleId: string;
  /**
   * 玩家設定的參數：X%、N、技能 id、道具 id、篩選條件…
   *
   * 形狀＝對應條件／動作的既有參數（`CombatCondition` 等扣掉 `type`），
   * 由 `systems/talentRules.ts` 併回 `{ type: ruleId, ...params }`。
   */
  params: Record<string, unknown> | null;
}

/**
 * 天賦格（`18-data-schema.md` § 18.9）。**自動天賦唯一的實例。**
 *
 * **取得後不會自動生效**（§ 51.3.4）：先以未安裝狀態躺在背包「天賦」分頁，
 * 玩家在天賦面板安裝並指定類型後才進入判定。
 */
export interface TalentSlot {
  id?: number;
  characterId: number;
  tier: TalentSlotTier;
  /**
   * 指派給哪個類型。**null ＝ 未安裝**（還在背包）。
   * 改類型走拆下再安裝（§ 51.3.2）。
   */
  assignedType: TalentType | null;
  /** 屬於哪一組天賦配置。未安裝時為 null */
  templateId: string | null;
  /** 同一組配置內的判定順序。未安裝時為 null */
  order: number | null;
  enabled: boolean;
  /**
   * 條件槽。長度上限＝`tier`，空槽為 null。
   * 拆下天賦格時**原樣保留**，重新安裝到同類型即復原（§ 51.3.4）。
   */
  conditions: (TalentSlotEntry | null)[];
  /** 動作槽。未設為 null —— 該天賦格不參與判定（§ 51.3.1） */
  action: TalentSlotEntry | null;
}

/** 已安裝 ＝ 指派了類型。未安裝的躺在背包，不進判定 */
export function isSlotInstalled(slot: TalentSlot): boolean {
  return slot.assignedType !== null;
}

/** 這個天賦格有沒有被設定過。信箱對帳只收全新的格（`52-mailbox.md` § 52.2.3.1） */
export function isSlotPristine(slot: TalentSlot): boolean {
  return !isSlotInstalled(slot)
    && slot.action === null
    && slot.conditions.every(c => c === null);
}

/** 空白的槽位陣列。天賦格新建與 tier 變動時用 */
export function emptyConditions(tier: TalentSlotTier): (TalentSlotEntry | null)[] {
  return Array.from({ length: conditionSlotCount(tier) }, () => null);
}

// === 取得 ===

/** 創角時給的 T1 天賦格數，三個類型加總（§ 51.3.3） */
export const STARTING_SLOT_COUNT = 5;

/** 每 N 級 +1 個 T1 天賦格，不設停止點（§ 51.3.3） */
export const SLOT_GRANT_LEVEL_INTERVAL = 5;

/** 到指定等級為止累計持有的 T1 天賦格數（含創角給的 5 個） */
export function totalSlotsFromLevel(level: number): number {
  return STARTING_SLOT_COUNT + Math.floor(level / SLOT_GRANT_LEVEL_INTERVAL);
}

/**
 * 天賦格合成投入數：同 tier ×2 → T+1 ×1，**必定成功**（§ 51.5.2）。
 * 純換算、產物確定，沒有成功率表 —— 這是系統唯一的合成。
 */
export const FUSE_INPUT_COUNT = 2;

// === 掉落（`27-drop-table.md` § 27.9）===

/** 天賦格掉率（僅 Boss，%）。一般怪不掉，T1 格不掉落（§ 51.6.1） */
export const SLOT_DROP_RATE_BOSS = 0.01;

/** Boss 掉落的天賦格 tier 區間。**天賦格保留下限**（§ 51.6.1） */
export const SLOT_TIER_BAND: readonly { maxAreaLevel: number; min: TalentSlotTier; max: TalentSlotTier }[] = [
  { maxAreaLevel: 40, min: 2, max: 2 },
  { maxAreaLevel: 60, min: 2, max: 3 },
  { maxAreaLevel: Infinity, min: 3, max: 4 },
];

export function slotTierBandFor(areaLevel: number): { min: TalentSlotTier; max: TalentSlotTier } {
  const band = SLOT_TIER_BAND.find(b => areaLevel <= b.maxAreaLevel);
  // 表的最後一筆是 Infinity，find 必定命中
  return { min: band!.min, max: band!.max };
}

/** 「購買道具至」「從倉庫取道具至」「依序補滿多個 buff」的組數上限（§ 51.4.11） */
export const MULTI_GROUP_MAX = 3;

/** 未開放的原因，Wiki 用（§ 51.4.3.2、§ 51.4.4） */
export const BLOCKED_LABELS: Record<'monster' | 'pending', string> = {
  monster: '尚未開放（等怪物機制）',
  pending: '尚未開放（等判定實作）',
};
