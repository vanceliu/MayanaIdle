/**
 * 自動天賦系統（`51-auto-talent.md`）
 *
 * 天賦格是規則的容器，鑲材是鑲進去的條件與動作。
 * **條件與動作本身的規格不在這裡** —— 那些仍在 `03-combat.md` § 3.12~3.13
 * 與 `49-village-script.md` § 49.2~49.3，由 `scriptEngine.ts` / `villageScript.ts`
 * 的型別與標籤常數承載。本檔只管「怎麼取得、鑲在哪、tier 多少」。
 */

/** 三種天賦類型。天賦格不綁類型，但鑲材綁（§ 51.2.1） */
export type TalentType = 'combat' | 'persistent' | 'supply';

export const TALENT_TYPES: readonly TalentType[] = ['combat', 'persistent', 'supply'];

export const TALENT_TYPE_LABELS: Record<TalentType, string> = {
  combat: '戰鬥',
  persistent: '常駐',
  supply: '補給',
};

export type TalentAffixKind = 'condition' | 'action';

/**
 * 鑲材的型態（§ 51.4.1）。差別只在參數是誰填的，**定義都只有一筆**：
 * - `fixed`：掉落時 roll 綁定單一對象，玩家不可改
 * - `pool`：掉落時 roll 綁定一個有語意的子集，玩家在子集內自選
 * - `free`：玩家自由選，隨時可改
 */
export type TalentAffixForm = 'fixed' | 'pool' | 'free';

/** 鑲材 tier。各池上限見 `TALENT_POOL_TIER_CAP` */
export type TalentTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 天賦格 tier ＝ 條件槽數（§ 51.3） */
export type TalentSlotTier = 1 | 2 | 3 | 4;

/** 天賦格 tier → 條件槽數。實作槽恆為 1 */
export function conditionSlotCount(tier: TalentSlotTier): number {
  return tier;
}

/**
 * 三個池的 tier 上限（§ 51.4.3）。
 *
 * **管的是「專屬鑲材」的最高 tier**，決定掉落與合成的天花板；
 * 不限制天賦格能鑲什麼 —— 共用鑲材的 tier 依戰鬥池訂，可高於常駐的上限，
 * 照樣鑲得進常駐格（§ 51.4.3.1）。
 */
export const TALENT_POOL_TIER_CAP: Record<TalentType, Record<TalentAffixKind, TalentTier>> = {
  combat: { condition: 7, action: 7 },
  persistent: { condition: 3, action: 3 },
  supply: { condition: 3, action: 4 },
};

/**
 * 鑲材定義（靜態 seed，`18-data-schema.md` § 18.9）。
 *
 * `ruleId` 指向既有的條件／動作型別字串（`CombatConditionType`、
 * `PersistentActionType`、`VillageActionType`…）。**標籤不存在這裡** ——
 * 一律經 `models` 既有的標籤常數渲染，編輯器與 Wiki 共用同一份（§ 43.4.12）。
 */
export interface TalentAffixDef {
  id: number;
  kind: TalentAffixKind;
  /** 適用類型，可多選。共用鑲材同時列入每一個適用類型的掉落池（§ 51.6.1.1） */
  appliesTo: TalentType[];
  tier: TalentTier;
  form: TalentAffixForm;
  ruleId: string;
  /**
   * 尚未開放。帶這個旗標的鑲材不進掉落池、不可合成產出、編輯器不顯示。
   * 阻擋項見 `blockedReason`。
   */
  blocked?: boolean;
  /**
   * `monster`：怪物側機制未做，不可先行實作（§ 51.4.4 成對原則）
   * `pending`：判定引擎還沒接上（§ 51.4.3.2）
   */
  blockedReason?: 'monster' | 'pending';
}

/**
 * 鑲材實例（`18-data-schema.md` § 18.9）。
 *
 * **不進 `characterBag`** —— `BagItem` 是 `{ itemId, amount }`，
 * 放不下 roll 出來的 `boundParam`。
 */
export interface TalentAffixInstance {
  id?: number;
  characterId: number;
  definitionId: number;
  /**
   * `fixed`／`pool` 掉落時 roll 出來的綁定值：技能 id、技能子集 key、道具類別。
   * `free` 恆為 null。
   *
   * **起始發放的 `fixed` 鑲材為 null（未綁定）**，首次鑲入時寫入，之後不可更改
   * —— 創角當下有三個職業沒有任何技能可綁（§ 51.7）。
   */
  boundParam: string | null;
  /**
   * 玩家在天賦格內設定的參數：X%、N、技能名、道具 id、篩選條件…
   *
   * 形狀＝對應條件／動作的既有參數（`CombatCondition` 等扣掉 `type`），
   * 由 `systems/talentRules.ts` 併回 `{ type: ruleId, ...params }`。
   *
   * **存在鑲材實例上而不是天賦格上**：一實體一格（§ 51.5.1），
   * 把「HP 低於 30%」搬到別格時，30% 應該跟著走。
   */
  params: Record<string, unknown> | null;
  /** 鑲在哪一個天賦格；未鑲入為 null。一實體一格（§ 51.5.1） */
  slotId: number | null;
  /** 鑲在該格的第幾個條件槽；實作槽為 null */
  slotIndex: number | null;
}

/**
 * 天賦格（`18-data-schema.md` § 18.9）。
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
   * 已安裝後可隨時改指派，不必先拆下（§ 51.3.2）。
   */
  assignedType: TalentType | null;
  /** 屬於哪一組天賦配置。未安裝時為 null */
  templateId: string | null;
  /** 同一組配置內的判定順序。未安裝時為 null */
  order: number | null;
  enabled: boolean;
}

/** 已安裝 ＝ 指派了類型。未安裝的躺在背包，不進判定 */
export function isSlotInstalled(slot: TalentSlot): boolean {
  return slot.assignedType !== null;
}

// === 取得 ===

/** 創角時給的 T1 天賦格數，三個類型加總（§ 51.3.3.1） */
export const STARTING_SLOT_COUNT = 5;

/** 每 N 級 +1 個 T1 天賦格，不設停止點（§ 51.3.3.2） */
export const SLOT_GRANT_LEVEL_INTERVAL = 5;

/** 到指定等級為止累計持有的 T1 天賦格數（含創角給的 5 個） */
export function totalSlotsFromLevel(level: number): number {
  return STARTING_SLOT_COUNT + Math.floor(level / SLOT_GRANT_LEVEL_INTERVAL);
}

/** 合成投入數：低階 ×2 → 高階 ×1（§ 51.3.3.3、§ 51.5.2） */
export const FUSE_INPUT_COUNT = 2;

/**
 * 鑲材合成成功率，依**產出的 tier** 查表（§ 51.5.2）。
 *
 * 天賦格合成**不查這張表**：天賦格是純換算，必定成功。
 * 鑲材失敗時退回投入的其中 1 份（淨損 1 份）。
 */
export const AFFIX_FUSE_SUCCESS_RATE: Record<Exclude<TalentTier, 1>, number> = {
  2: 50,
  3: 30,
  4: 15,
  5: 10,
  6: 5,
  7: 2,
};

// === 掉落（`27-drop-table.md` § 27.9）===

/** 鑲材掉率（一般怪，%）。T7 不掉落。Boss 為 2 倍 */
export const AFFIX_DROP_RATE: Record<TalentTier, number> = {
  1: 3,
  2: 2,
  3: 0.5,
  4: 0.1,
  5: 0.1,
  6: 0.1,
  7: 0,
};

/** Boss 掉率倍率 */
export const BOSS_DROP_MULTIPLIER = 2;

/** 天賦格掉率（僅 Boss，%）。一般怪不掉，T1 格不掉落 */
export const SLOT_DROP_RATE_BOSS = 0.01;

/**
 * 區域最高等級 → 可掉的鑲材 tier 區間（§ 51.6.1）。
 *
 * **區間有下限**：Lv.41 以上的區域不再掉 T1，Lv.51 以上不再掉 T2。
 * 低階鑲材只在低等區產出。
 */
export const AFFIX_TIER_BAND: readonly { maxAreaLevel: number; min: TalentTier; max: TalentTier }[] = [
  { maxAreaLevel: 15, min: 1, max: 1 },
  { maxAreaLevel: 30, min: 1, max: 2 },
  { maxAreaLevel: 40, min: 1, max: 3 },
  { maxAreaLevel: 50, min: 2, max: 4 },
  { maxAreaLevel: 60, min: 3, max: 5 },
  { maxAreaLevel: Infinity, min: 4, max: 6 },
];

/** Boss 掉落的天賦格 tier 區間，沿用同一組區域分帶（§ 51.6.2） */
export const SLOT_TIER_BAND: readonly { maxAreaLevel: number; min: TalentSlotTier; max: TalentSlotTier }[] = [
  { maxAreaLevel: 40, min: 2, max: 2 },
  { maxAreaLevel: 60, min: 2, max: 3 },
  { maxAreaLevel: Infinity, min: 3, max: 4 },
];

export function affixTierBandFor(areaLevel: number): { min: TalentTier; max: TalentTier } {
  const band = AFFIX_TIER_BAND.find(b => areaLevel <= b.maxAreaLevel);
  // 表的最後一筆是 Infinity，find 必定命中
  return { min: band!.min, max: band!.max };
}

export function slotTierBandFor(areaLevel: number): { min: TalentSlotTier; max: TalentSlotTier } {
  const band = SLOT_TIER_BAND.find(b => areaLevel <= b.maxAreaLevel);
  return { min: band!.min, max: band!.max };
}

// === 池型鑲材的子集 ===

/**
 * 「施放指定系別攻擊技能」roll 到的子集（§ 51.4.9），共 9 個。
 * 兩個家族**刻意重疊**：範圍技橫跨各元素，火系橫跨單體與範圍。
 */
export const SKILL_POOL_KEYS = [
  'fire', 'ice', 'wind', 'earth', 'light', 'dark', 'none',
  'single', 'aoe',
] as const;
export type SkillPoolKey = typeof SKILL_POOL_KEYS[number];

export const SKILL_POOL_LABELS: Record<SkillPoolKey, string> = {
  fire: '火系', ice: '冰系', wind: '風系', earth: '地系',
  light: '光系', dark: '暗系', none: '無屬性',
  single: '單體', aoe: '範圍',
};

/** 「購買／從倉庫取指定類別道具」roll 到的類別（§ 51.4.11） */
export const ITEM_POOL_KEYS = ['potion', 'speed_potion', 'scroll', 'cure'] as const;
export type ItemPoolKey = typeof ITEM_POOL_KEYS[number];

export const ITEM_POOL_LABELS: Record<ItemPoolKey, string> = {
  potion: '藥水',
  speed_potion: '加速藥水',
  scroll: '卷軸',
  cure: '狀態解除道具',
};

/** T4「購買道具至」「從倉庫取道具至」的組數上限（§ 51.4.11） */
export const MULTI_GROUP_MAX = 3;

/** 未開放的原因，Wiki 的「取得」欄用（§ 51.4.3.2、§ 51.4.4） */
export const BLOCKED_LABELS: Record<'monster' | 'pending', string> = {
  monster: '尚未開放（等怪物機制）',
  pending: '尚未開放（等判定實作）',
};
