/**
 * 印記系統 — `docs/design/46-sigil.md`
 *
 * 印記是**只操作詞綴**的消耗品，在印記師（`13-town.md` § 13.13）使用。
 * 與強化石的分工：強化石只把 Tier 推到 T5，印記負責重骰種類、重骰數值、突破 T5。
 *
 * 這裡的四支 `apply*` 一律走 `models/affix.ts` 的既有 roll 函式
 * （`generateAffixes` / `rollAffixValue` / `rollErosionDamage` / `rollRestorePercent`），
 * **不另寫一份詞綴生成邏輯** —— 兩份實作只要有一邊改動就會靜默走鐘。
 */

import {
  AFFIX_DEFINITIONS,
  BRAND_ELEMENTS,
  DEFAULT_MAX_AFFIX_TIER,
  SHOP_MAX_AFFIX_TIER,
  generateAffixes,
  getAffixPoolForSlot,
  getSpecialAffixPoolForSlot,
  isSpecialAffixType,
  rollAffixValue,
  rollErosionDamage,
  rollRestorePercent,
  type Affix,
  type AffixCategory,
  type AffixType,
  type AnyAffixType,
} from './affix';

export type SigilType = 'chaos' | 'sting' | 'recarve' | 'enhance';

export interface SigilDefinition {
  type: SigilType;
  /** 道具名 —— seed（`db/seed/itemSeeds.ts`）與背包一律以名字為 key */
  itemName: string;
  name: string;
  /** § 46.2 的作用敘述。Wiki 直接引用，不另寫一份 */
  description: string;
  /** `item` = 整件裝備（混沌）；`affix` = 指定一條詞綴 */
  target: 'item' | 'affix';
}

/** § 46.2 印記清單 */
export const SIGIL_DEFINITIONS: SigilDefinition[] = [
  {
    type: 'chaos', itemName: '混沌印記', name: '混沌印記', target: 'item',
    description: '全部 4 條詞綴重骰（種類／Tier／數值），Tier 上限 T5，商店裝 T3 且不出特殊詞綴',
  },
  {
    type: 'sting', itemName: '刺針印記', name: '刺針印記', target: 'affix',
    description: '指定一條詞綴換成同部位詞綴池的另一條，Tier 不變',
  },
  {
    type: 'recarve', itemName: '重刻印記', name: '重刻印記', target: 'affix',
    description: '指定一條詞綴的隨機數值全部重骰，種類與 Tier 不變',
  },
  {
    type: 'enhance', itemName: '強化印記', name: '強化印記', target: 'affix',
    description: '指定一條詞綴 T5→T6（10%）／T6→T7（2%），失敗掉回 T1',
  },
];

export function getSigilDefinition(type: SigilType): SigilDefinition {
  return SIGIL_DEFINITIONS.find(d => d.type === type)!;
}

export function getSigilByItemName(itemName: string): SigilDefinition | undefined {
  return SIGIL_DEFINITIONS.find(d => d.itemName === itemName);
}

/** § 46.3 混沌印記重骰的 Tier 上限（商店裝另受 `maxAffixTier` 夾住） */
export const CHAOS_SIGIL_MAX_TIER = 5;
/** 混沌印記重骰的詞綴條數（§ 7.1 每件裝備 4 格） */
export const CHAOS_SIGIL_SLOTS = 4;
/**
 * § 46.4 原詞綴是特殊詞綴時，換出來的一般詞綴固定的 Tier。
 * 特殊詞綴沒有 Tier 可繼承，總得有個值。
 */
export const STING_SPECIAL_REPLACEMENT_TIER = 5;

/** § 46.6 強化印記的成功率（`from` → `from + 1`） */
export const ENHANCE_SIGIL_RATES: { from: number; rate: number }[] = [
  { from: 5, rate: 0.10 },
  { from: 6, rate: 0.02 },
];

/** § 46.6 強化印記失敗後掉回的 Tier */
export const ENHANCE_SIGIL_FAIL_TIER = 1;

export function getEnhanceSigilRate(tier: number): number | undefined {
  return ENHANCE_SIGIL_RATES.find(r => r.from === tier)?.rate;
}

/** 商店裝以實例的 `maxAffixTier` 判定（§ 6A.6，商店購買時寫入 3） */
export function isShopGear(maxAffixTier?: number): boolean {
  return (maxAffixTier ?? DEFAULT_MAX_AFFIX_TIER) <= SHOP_MAX_AFFIX_TIER;
}

export interface SigilContext {
  /** 詞綴分類（`getAffixCategoryForSlot` 的結果） */
  category: AffixCategory;
  /**
   * 角色等級 —— 特殊詞綴機率與門檻改查角色等級（§ 46.8）。
   * 印記在城鎮使用，沒有區域等級可查。
   */
  charLevel: number;
  /** 實例的詞綴 Tier 硬上限（商店裝 = 3），掉落／製作品為 undefined */
  maxAffixTier?: number;
  /** 武器平均基傷（`getWeaponBaseDamage`）—— 元素侵蝕的每跳傷害用 */
  weaponBaseDamage?: number;
  /** 新手裝（seed `acquireType: 'starter'`）—— 一律不可使用印記（§ 46.7） */
  isStarterGear?: boolean;
}

export interface SigilCheck {
  ok: boolean;
  /** 不可使用的原因，直接顯示給玩家 */
  reason?: string;
}

/**
 * § 46.7 可用性判定。UI 與 apply 都走這裡，避免「按鈕擋得住但函式擋不住」。
 */
export function canUseSigil(
  type: SigilType,
  affixes: Affix[] | undefined,
  affixIndex: number | undefined,
  ctx: Pick<SigilContext, 'isStarterGear'>,
): SigilCheck {
  if (ctx.isStarterGear) return { ok: false, reason: '新手裝沒有詞綴，無法使用印記' };

  if (type === 'chaos') return { ok: true };

  if (!affixes || affixes.length === 0) return { ok: false, reason: '這件裝備沒有詞綴' };
  if (affixIndex == null || !affixes[affixIndex]) return { ok: false, reason: '請先指定一條詞綴' };

  const affix = affixes[affixIndex];
  if (isSpecialAffixType(affix.type)) {
    if (type === 'recarve') return { ok: false, reason: '特殊詞綴沒有數值，無法重刻' };
    if (type === 'enhance') return { ok: false, reason: '特殊詞綴沒有 Tier，無法強化' };
    return { ok: true }; // 刺針可以把特殊詞綴換掉
  }

  if (type === 'enhance') {
    if (affix.tier >= 7) return { ok: false, reason: '已是 T7，無法再強化' };
    if (getEnhanceSigilRate(affix.tier) === undefined) {
      return { ok: false, reason: `T${affix.tier} 請用強化石，強化印記只受理 T5／T6` };
    }
  }

  return { ok: true };
}

export interface SigilResult {
  affixes: Affix[];
  /** 強化印記：Tier 是否上升。其餘印記一律 true（必定生效） */
  success: boolean;
  message: string;
}

/** 元素刻印／元素侵蝕抽到當下決定的元素（§ 7.4，六種均等） */
function rollElement() {
  return BRAND_ELEMENTS[Math.floor(Math.random() * BRAND_ELEMENTS.length)];
}

function affixName(type: AnyAffixType): string {
  if (isSpecialAffixType(type)) return '特殊詞綴';
  return AFFIX_DEFINITIONS.find(d => d.type === type)?.name ?? type;
}

/**
 * § 46.3 混沌印記：全部 4 條詞綴重骰。
 *
 * Tier **均等隨機**（不查 § 7.7 的區域權重表）；特殊詞綴機率改查角色等級。
 * 商店裝改吃 T1~T3 且完全不出特殊詞綴。
 */
export function applyChaosSigil(ctx: SigilContext): SigilResult {
  const shop = isShopGear(ctx.maxAffixTier);
  const cap = shop
    ? Math.min(ctx.maxAffixTier ?? SHOP_MAX_AFFIX_TIER, CHAOS_SIGIL_MAX_TIER)
    : CHAOS_SIGIL_MAX_TIER;

  const affixes = generateAffixes(ctx.category, ctx.charLevel, CHAOS_SIGIL_SLOTS, false, {
    maxTier: cap,
    uniformTier: true,
    noSpecialAffix: shop,
    ...(ctx.weaponBaseDamage != null ? { weaponBaseDamage: ctx.weaponBaseDamage } : {}),
  });

  return { affixes, success: true, message: `混沌印記：詞綴全部重骰（上限 T${cap}）` };
}

/**
 * § 46.4 刺針印記：把一條詞綴換成同部位詞綴池的另一條，**Tier 不變**。
 *
 * 池 = 一般詞綴 ＋ 該部位可用的特殊詞綴（門檻改看角色等級），**合併後均等抽**；
 * 同件裝備已有的詞綴不列入（§ 7.6 不可重複）。商店裝的池不含特殊詞綴。
 */
export function applyStingSigil(
  affixes: Affix[],
  affixIndex: number,
  ctx: SigilContext,
): SigilResult {
  const old = affixes[affixIndex];
  const taken = new Set<AnyAffixType>(
    affixes.filter((_, i) => i !== affixIndex).map(a => a.type),
  );

  const normals = getAffixPoolForSlot(ctx.category)
    .filter(d => !taken.has(d.type) && d.type !== old.type)
    .map(d => d.type as AnyAffixType);
  const specials = isShopGear(ctx.maxAffixTier)
    ? []
    : getSpecialAffixPoolForSlot(ctx.category, ctx.charLevel)
        .filter(d => !taken.has(d.type) && d.type !== old.type)
        .map(d => d.type as AnyAffixType);

  const pool = [...normals, ...specials];
  if (pool.length === 0) {
    return { affixes, success: false, message: '沒有其他詞綴可以換了' };
  }

  const picked = pool[Math.floor(Math.random() * pool.length)];
  const next = [...affixes];

  if (isSpecialAffixType(picked)) {
    // § 7.10.2 特殊詞綴無 Tier，原本的 Tier 直接作廢
    next[affixIndex] = { type: picked, tier: 0, value: 0 };
    return { affixes: next, success: true, message: `刺針印記：換成 ${affixName(picked)}` };
  }

  // 原本是特殊詞綴時沒有 Tier 可繼承，固定 T5（仍以實例的硬上限夾住）
  const tier = isSpecialAffixType(old.type)
    ? Math.min(STING_SPECIAL_REPLACEMENT_TIER, ctx.maxAffixTier ?? DEFAULT_MAX_AFFIX_TIER)
    : old.tier;
  const type = picked as AffixType;
  const needsElement = type === 'element_brand' || type === 'element_erosion';

  next[affixIndex] = {
    type,
    tier,
    value: rollAffixValue(tier, type),
    ...(needsElement ? { element: rollElement() } : {}),
    ...(type === 'element_erosion'
      ? { dotDamage: rollErosionDamage(ctx.weaponBaseDamage ?? 1) } : {}),
    ...(type === 'on_hit_hp' || type === 'on_hit_mp'
      ? { restorePercent: rollRestorePercent(type) } : {}),
  };

  return {
    affixes: next,
    success: true,
    message: `刺針印記：換成 ${affixName(type)} T${tier}`,
  };
}

/**
 * § 46.5 重刻印記：種類與 Tier 不變，把這條詞綴「抽出來的隨機數值」整組重骰。
 *
 * 含觸發率型詞綴的觸發率、元素侵蝕的每跳傷害、受擊回復的回復比例。
 * **元素不重骰** —— 元素不是數值。
 */
export function applyRecarveSigil(
  affixes: Affix[],
  affixIndex: number,
  ctx: SigilContext,
): SigilResult {
  const old = affixes[affixIndex];
  const type = old.type as AffixType;
  const next = [...affixes];

  next[affixIndex] = {
    ...old,
    value: rollAffixValue(old.tier, type),
    ...(type === 'element_erosion'
      ? { dotDamage: rollErosionDamage(ctx.weaponBaseDamage ?? 1) } : {}),
    ...(type === 'on_hit_hp' || type === 'on_hit_mp'
      ? { restorePercent: rollRestorePercent(type) } : {}),
  };

  return {
    affixes: next,
    success: true,
    message: `重刻印記：${affixName(type)} 數值重骰`,
  };
}

/**
 * § 46.6 強化印記：只受理 T5→T6（10%）與 T6→T7（2%）。
 *
 * 失敗時該詞綴掉回 T1；成功與失敗都以新 Tier 的區間重骰百分比數值。
 * 元素侵蝕的每跳傷害與受擊回復的回復比例與 Tier 無關，**不動**。
 */
export function applyEnhanceSigil(
  affixes: Affix[],
  affixIndex: number,
): SigilResult {
  const old = affixes[affixIndex];
  const rate = getEnhanceSigilRate(old.tier);
  if (rate === undefined) {
    return { affixes, success: false, message: '強化印記只受理 T5／T6 的詞綴' };
  }

  const success = Math.random() < rate;
  const tier = success ? old.tier + 1 : ENHANCE_SIGIL_FAIL_TIER;
  const type = old.type as AffixType;
  const next = [...affixes];
  next[affixIndex] = { ...old, tier, value: rollAffixValue(tier, type) };

  return {
    affixes: next,
    success,
    message: success
      ? `強化印記成功！${affixName(type)} 升至 T${tier}`
      : `強化印記失敗… ${affixName(type)} 掉回 T${tier}`,
  };
}
