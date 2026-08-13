import type { EquipmentInstance } from './equipment';

/**
 * 村莊腳本（`49-village-script.md`）
 *
 * 與戰鬥／常駐腳本同一套形狀：有序規則，條件（AND）＋動作。
 * 判定在任何地方都會跑 —— 「回城」要在野外成立，其餘動作由動作自己擋在城鎮外，
 * 所以同一份規則能同時描述「什麼時候該回城」與「回城之後做什麼」。
 */

export type VillageConditionType =
  | 'always'
  /** 背包已用格數 ≥ N */
  | 'bag_slots_used_gte'
  /** 指定道具持有量 < N */
  | 'item_count_below'
  | 'gold_below'
  | 'gold_above'
  // === `51-auto-talent.md` § 51.4.8 新增 ===
  /** 在城鎮（`match: 'town'`）或在野外（`'field'`） */
  | 'in_town'
  /** 背包剩餘格數 ≤ N。取東西前該看的是剩餘，不是已用 */
  | 'bag_free_slots_lte'
  /** 有上次掛機點紀錄 */
  | 'has_hunt_location'
  /** 三類型共用（§ 51.4.5）：所在區域 ＝ 指定區域 */
  | 'current_area_is'
  | 'warehouse_gold_gte'
  | 'warehouse_item_gte';

export type VillageActionType =
  /** 消耗回城卷軸回到城鎮，回城前會記下當前掛機點 */
  | 'return_town'
  /** 把指定道具補到目標數量（買不起就買到買得起為止） */
  | 'buy_item'
  /** 依顏色等級批量販售素材 */
  | 'sell_materials'
  /** 依顏色等級批量販售裝備，可設保留條件 */
  | 'sell_equipment'
  /** 依顏色等級把素材存進倉庫 */
  | 'deposit_materials'
  /** 把符合篩選條件的裝備存進倉庫 */
  | 'deposit_equipment'
  /** 從倉庫把指定道具補到目標數量 */
  | 'withdraw_item'
  /** 金幣存進共用倉庫（留下 keepGold） */
  | 'deposit_gold'
  /** 從共用倉庫領金幣，補到 targetAmount */
  | 'withdraw_gold'
  /** 回到上次掛機點 */
  | 'return_to_hunt'
  // === `51-auto-talent.md` § 51.4.11 新增 ===
  /** 使用旅館：恢復 HP／MP ＋ 解除異常狀態（`13-town.md` § 13.7） */
  | 'use_inn'
  /** 販售素材（僅門檻）：不吃保留設定，保護開關固定開啟 */
  | 'sell_materials_threshold_only'
  /** 販售裝備（僅門檻）：不吃 § 49.4 的保留條件，但**門檻照樣要設** */
  | 'sell_equipment_threshold_only';

/** 共用倉庫（帳號層級）或個人倉庫（角色層級），見 `13-town.md` § 13.8 */
export type WarehouseKind = 'shared' | 'personal';

export interface VillageCondition {
  type: VillageConditionType;
  value?: number;
  /** `item_count_below`／`warehouse_item_gte` 用。存 id 不存名稱（§ 99.1.7） */
  itemId?: number;
  /** `in_town` 用：`'town'` 或 `'field'` */
  match?: string;
  /** `warehouse_*` 用：共用或個人倉庫 */
  warehouse?: WarehouseKind;
}

/**
 * 裝備篩選條件。**任一條符合即命中**。
 *
 * 兩個動作共用同一份形狀，但方向相反：
 * 販售裝備時命中＝保留（不賣），存入倉庫時命中＝要存。
 * 都是在描述「哪些裝備是我在意的」，分成兩套欄位只會讓玩家設兩次。
 */
export interface EquipmentKeepFilter {
  /** 有詞綴的 tier 超過 N 就保留 */
  affixTierAbove?: number;
  /** 帶有這些詞綴之一就保留 */
  affixTypes?: string[];
  /** 本職業可裝備的保留 */
  classUsable?: boolean;
  /** 這些武器類型／`armor` 保留 */
  equipTypes?: string[];
  /** 白名單：這些模板一律保留 */
  templateIds?: number[];
}

export interface VillageAction {
  type: VillageActionType;
  /** `buy_item` 用 */
  itemId?: number;
  /** `buy_item`：補到幾個 */
  targetAmount?: number;
  /** `sell_materials` / `sell_equipment`：顏色等級門檻 */
  maxTier?: number;
  /** `sell_materials`：跳過進得了配方的素材（預設 true） */
  skipCraftMaterials?: boolean;
  /** `sell_equipment` 的保留條件 */
  keep?: EquipmentKeepFilter;
  /** `return_town`：指定卷軸城鎮；未指定為任意卷軸 */
  scrollTownId?: string;
  /** 倉庫類動作：存取哪個倉庫（預設共用） */
  warehouse?: WarehouseKind;
  /** `deposit_gold`：身上要留下的金幣，其餘存進倉庫 */
  keepGold?: number;
  /**
   * `sell_materials`：素材白名單，指定的永遠不賣。
   *
   * 補 `hasMaterialUsage()` 涵蓋不到的情況 —— 收集任務的目標素材沒有配方用途，
   * 正在做任務時被門檻掃掉就是實質損失（`51-auto-talent.md` § 51.4.11）。
   */
  keepItemIds?: number[];
  /**
   * `buy_item`／`withdraw_item`：多組「道具＋目標數量」。
   * T1 的池型版只能設 1 組，T4 的自選版最多 3 組（§ 51.4.11）。
   */
  groups?: { itemId: number; targetAmount: number }[];
}

export interface VillageRule {
  id: string;
  enabled: boolean;
  /** AND：全部成立才觸發。空陣列＝無條件 */
  conditions: VillageCondition[];
  action: VillageAction;
}

/**
 * 預設是**空的**。
 *
 * 村莊腳本會花玩家的錢、賣玩家的東西、把角色從地圖上傳走，
 * 這些門檻（幾格算滿、藥水補到幾瓶、賣到哪個顏色）沒有一個能由系統替玩家決定。
 * 空腳本只是「不自動化」，不像空的戰鬥腳本會讓角色站著不出手。
 */
export const DEFAULT_VILLAGE_SCRIPT: VillageRule[] = [];

// === 顯示標籤（編輯器與 Wiki 共用同一份）===

export const VILLAGE_CONDITION_LABELS: Record<VillageConditionType, string> = {
  always: '永遠',
  bag_slots_used_gte: '背包已用格數 ≥',
  item_count_below: '道具數量少於',
  gold_below: '金幣少於',
  gold_above: '金幣多於',
  in_town: '在城鎮／在野外',
  bag_free_slots_lte: '背包剩餘格數 ≤',
  has_hunt_location: '有上次掛機點',
  current_area_is: '所在區域 ＝',
  warehouse_gold_gte: '倉庫金幣 ≥',
  warehouse_item_gte: '倉庫有指定道具 ≥',
};

export const VILLAGE_ACTION_LABELS: Record<VillageActionType, string> = {
  return_town: '回城',
  sell_materials: '販售素材',
  use_inn: '使用旅館',
  sell_materials_threshold_only: '販售素材（僅門檻）',
  sell_equipment_threshold_only: '販售裝備（僅門檻）',
  sell_equipment: '販售裝備',
  buy_item: '購買道具至',
  deposit_materials: '存入素材',
  deposit_equipment: '存入裝備',
  withdraw_item: '從倉庫取道具至',
  deposit_gold: '存入金幣（身上留下）',
  withdraw_gold: '從倉庫領金幣至',
  return_to_hunt: '返回上次掛機點',
};

/** 上次掛機點：回城前記下來，`return_to_hunt` 照它走回去 */
export interface HuntLocation {
  zoneId: string;
  regionId: string;
  floor: number | null;
  x: number;
  y: number;
}

// === 保留條件判定 ===

/**
 * 這件裝備是否命中篩選條件。
 * 任一條成立即命中 —— 販售時代表保留，存倉庫時代表要存。
 * 保留方向寧可少賣不可誤賣，所以是 OR 不是 AND。
 */
export function matchesEquipmentFilter(
  item: EquipmentInstance,
  keep: EquipmentKeepFilter | undefined,
  className: string,
): boolean {
  if (!keep) return false;

  if (keep.templateIds?.includes(item.templateId)) return true;

  if (keep.affixTierAbove != null) {
    if (item.affixes?.some(a => a.tier > keep.affixTierAbove!)) return true;
  }

  if (keep.affixTypes?.length) {
    if (item.affixes?.some(a => keep.affixTypes!.includes(a.type))) return true;
  }

  if (keep.classUsable) {
    // 沒標 requiredClass 的是全職業共用，對任何職業都算「可裝備」
    const usable = !item.requiredClass || item.requiredClass.length === 0
      || item.requiredClass.includes(className);
    if (usable) return true;
  }

  if (keep.equipTypes?.length && keep.equipTypes.includes(item.type)) return true;

  return false;
}

// === 讀檔防線 ===

/**
 * 與戰鬥／常駐腳本同一套政策：形狀不對就整份重置。
 * 村莊腳本的預設是空陣列，所以「重置」等於「不自動化」，
 * 不會發生「讀到壞資料就開始亂買亂賣」。
 */
export function normalizeVillageRules(rules: unknown): VillageRule[] {
  if (!Array.isArray(rules)) return DEFAULT_VILLAGE_SCRIPT;
  const ok = rules.every(
    r => r && typeof r === 'object'
      && typeof (r as VillageRule).id === 'string'
      && !!(r as VillageRule).action
      && Array.isArray((r as VillageRule).conditions),
  );
  return ok ? (rules as VillageRule[]) : DEFAULT_VILLAGE_SCRIPT;
}
