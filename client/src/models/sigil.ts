/**
 * 印記系統 — `docs/design/46-sigil.md`
 *
 * 印記是**只操作詞綴**的消耗品，在印記師（`13-town.md` § 13.13）使用。
 * 詞綴的升階、重骰與品質全部走這裡，鐵匠鋪只管強化等級（+N）與製作。
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
  isTierlessAffixType,
  isAttributeAffixType,
  BONUS_ATTRIBUTE_VALUE,
  rollAffixValue,
  rollErosionDamage,
  rollRestorePercent,
  type Affix,
  type AffixCategory,
  type AffixType,
  type AnyAffixType,
} from './affix';
import { ATTRIBUTE_KEYS } from './attributes';

export type SigilType = 'chaos' | 'sting' | 'recarve' | 'temper' | 'enhance' | 'polish';

export interface SigilDefinition {
  type: SigilType;
  /** 對應的道具 id —— 背包一律以 id 為 key（§ 99.1），名稱由 id 反查 */
  itemId: number;
  name: string;
  /** § 46.2 的作用敘述。Wiki 直接引用，不另寫一份 */
  description: string;
  /** `item` = 整件裝備（混沌／工藝）；`affix` = 指定一條詞綴 */
  target: 'item' | 'affix';
}

/** § 46.2 印記清單 */
export const SIGIL_DEFINITIONS: SigilDefinition[] = [
  {
    type: 'chaos', itemId: 147, name: '混沌印記', target: 'item',
    description: '全部 4 條詞綴重骰（種類／Tier／數值），Tier 上限 T5，商店裝 T3 且不出特殊詞綴',
  },
  {
    type: 'sting', itemId: 148, name: '刺針印記', target: 'affix',
    description: '指定一條詞綴換成同部位詞綴池的另一條，Tier 不變',
  },
  {
    type: 'recarve', itemId: 149, name: '重刻印記', target: 'affix',
    description: '指定一條詞綴的隨機數值全部重骰，種類與 Tier 不變',
  },
  {
    type: 'temper', itemId: 10, name: '精鍊印記', target: 'affix',
    description: '指定一條詞綴 Tier +1，必定成功，最高推到該裝備的取得管道上限（一般 T5、商店裝 T3）',
  },
  {
    type: 'enhance', itemId: 150, name: '突破印記', target: 'affix',
    description: '指定一條詞綴 T5→T6（10%）／T6→T7（2%），失敗掉回 T1',
  },
  {
    type: 'polish', itemId: 9, name: '工藝印記', target: 'item',
    description: '整件裝備品質 +1%（上限 20%），必定成功，另收 5,000G',
  },
];

/**
 * 背包與 Wiki 的「用途」標籤（§ 46.2）。完整敘述看 `description`，這裡只要一句話。
 *
 * 以 `SigilType` 為 key —— 新增印記時 TypeScript 會強制補上，
 * 不會出現「有的印記標了用途、有的沒標」。
 */
export const SIGIL_USAGE_LABEL: Record<SigilType, string> = {
  chaos: '印記師詞綴重骰',
  sting: '印記師詞綴替換',
  recarve: '印記師數值重骰',
  temper: '印記師詞綴升階',
  enhance: '印記師詞綴突破',
  polish: '印記師品質提升',
};

/**
 * 印記師面板的排列順序（`13-town.md` § 13.13）。面板是兩欄，一列兩個：
 * 精鍊／突破（Tier 升階，最常用的一組放第一排）、刺針／重刻（換與重骰）、
 * 混沌／工藝（整件裝備）。
 *
 * 與 `SIGIL_DEFINITIONS` 的順序分開 —— 那份是規格清單（§ 46.2），
 * 動它會連帶影響 Wiki 與掉落測試的敘述順序。
 */
export const SIGIL_PANEL_ORDER: SigilType[] = [
  'temper', 'enhance',
  'sting', 'recarve',
  'chaos', 'polish',
];

/** 打開印記師時預設選中的印記：必定成功、最常用的精鍊 */
export const DEFAULT_PANEL_SIGIL: SigilType = 'temper';

export function getSigilDefinition(type: SigilType): SigilDefinition {
  return SIGIL_DEFINITIONS.find(d => d.type === type)!;
}

export function getSigilByItemId(itemId: number): SigilDefinition | undefined {
  return SIGIL_DEFINITIONS.find(d => d.itemId === itemId);
}

const SIGIL_ITEM_IDS = new Set(SIGIL_DEFINITIONS.map(d => d.itemId));

/**
 * 是否為印記（`35-inventory-constraints.md` § 35.20）。
 *
 * 印記**不佔背包格**，所以容量計算與所有「背包已滿」的入口都要先問過這裡。
 * 判定一律以 id 查 `SIGIL_DEFINITIONS`（§ 99.1），不看名稱也不另立清單 ——
 * 之後新增印記時，這條路徑自動跟上。
 */
export function isSigilItemId(itemId: number): boolean {
  return SIGIL_ITEM_IDS.has(itemId);
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

/** § 46.7 突破印記的成功率（`from` → `from + 1`） */
export const ENHANCE_SIGIL_RATES: { from: number; rate: number }[] = [
  { from: 5, rate: 0.10 },
  { from: 6, rate: 0.02 },
];

/** § 46.7 突破印記失敗後掉回的 Tier */
export const ENHANCE_SIGIL_FAIL_TIER = 1;

/** § 46.8 工藝印記：每次品質 +1%、上限 20%、另收 5,000G（數值來源 `08-quality.md` § 8.3） */
export const POLISH_SIGIL_QUALITY_STEP = 1;
export const POLISH_SIGIL_QUALITY_MAX = 20;
export const POLISH_SIGIL_GOLD_COST = 5000;

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
  /** 裝備當前品質 %（工藝印記用，§ 46.8） */
  quality?: number;
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
 * 一條詞綴的**下一階由哪一種印記受理**（§ 46.2）。
 *
 * 取得管道上限（商店裝 T3、其餘 T5）以內走精鍊印記、必定成功；
 * 上限以上到 T7 走突破印記、有失敗率。回 undefined = 已到頂或不受理。
 */
export function getUpgradeSigilFor(
  affix: Affix,
  maxAffixTier?: number,
): { type: 'temper' | 'enhance'; rate: number } | undefined {
  // 特殊詞綴與額外屬性都沒有 Tier（§ 46.9）
  if (isTierlessAffixType(affix.type)) return undefined;
  const cap = maxAffixTier ?? DEFAULT_MAX_AFFIX_TIER;
  if (affix.tier < cap) return { type: 'temper', rate: 1 };
  const rate = getEnhanceSigilRate(affix.tier);
  return rate === undefined ? undefined : { type: 'enhance', rate };
}

/**
 * § 46.9 可用性判定。UI 與 apply 都走這裡，避免「按鈕擋得住但函式擋不住」。
 */
export function canUseSigil(
  type: SigilType,
  affixes: Affix[] | undefined,
  affixIndex: number | undefined,
  ctx: Pick<SigilContext, 'isStarterGear' | 'maxAffixTier' | 'quality'>,
): SigilCheck {
  if (ctx.isStarterGear) return { ok: false, reason: '新手裝沒有詞綴，無法使用印記' };

  if (type === 'chaos') return { ok: true };

  if (!affixes || affixes.length === 0) return { ok: false, reason: '這件裝備沒有詞綴' };

  // § 46.8 工藝印記的對象是整件裝備，不指定詞綴
  if (type === 'polish') {
    if ((ctx.quality ?? 0) >= POLISH_SIGIL_QUALITY_MAX) {
      return { ok: false, reason: `品質已達 ${POLISH_SIGIL_QUALITY_MAX}%，無法再提升` };
    }
    return { ok: true };
  }

  if (affixIndex == null || !affixes[affixIndex]) return { ok: false, reason: '請先指定一條詞綴' };

  const affix = affixes[affixIndex];
  // § 46.9 無 Tier 的兩類：特殊詞綴與額外屬性。升階與重刻都不受理，只有刺針換得掉
  if (isTierlessAffixType(affix.type)) {
    const what = isAttributeAffixType(affix.type) ? '額外屬性' : '特殊詞綴';
    if (type === 'recarve') return { ok: false, reason: `${what}沒有數值，無法重刻` };
    if (type === 'temper' || type === 'enhance') {
      return { ok: false, reason: `${what}沒有 Tier，無法升階` };
    }
    return { ok: true };
  }

  if (type === 'temper' || type === 'enhance') {
    const next = getUpgradeSigilFor(affix, ctx.maxAffixTier);
    if (!next) return { ok: false, reason: `T${affix.tier} 已是上限，無法再升階` };
    if (next.type !== type) {
      const wanted = getSigilDefinition(next.type).name;
      // Tier 寫在同一列的標籤上（`13-town.md` § 13.13.1：列上只放不能選的原因）
      return { ok: false, reason: `下一階由${wanted}受理` };
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

  // § 7.3.1 額外屬性同樣無 Tier，值固定 +1，加在哪個屬性當下才抽
  if (isAttributeAffixType(picked)) {
    next[affixIndex] = {
      type: picked, tier: 0, value: BONUS_ATTRIBUTE_VALUE,
      attribute: ATTRIBUTE_KEYS[Math.floor(Math.random() * ATTRIBUTE_KEYS.length)],
    };
    return { affixes: next, success: true, message: `刺針印記：換成 ${affixName(picked)}` };
  }

  // 原本無 Tier 時沒有 Tier 可繼承，固定 T5（仍以實例的硬上限夾住）
  const tier = isTierlessAffixType(old.type)
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
  if (isTierlessAffixType(old.type)) {
    return { affixes, success: false, message: '重刻印記只受理有數值的詞綴' };
  }
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
 * § 46.6 精鍊印記：Tier +1，**必定成功**，推到取得管道上限為止（商店裝 T3、其餘 T5）。
 *
 * 升階後以新 Tier 的區間重骰百分比數值；元素、每跳傷害、回復比例與 Tier 無關，**不動**。
 */
export function applyTemperSigil(
  affixes: Affix[],
  affixIndex: number,
  ctx: Pick<SigilContext, 'maxAffixTier'>,
): SigilResult {
  const old = affixes[affixIndex];
  const cap = ctx.maxAffixTier ?? DEFAULT_MAX_AFFIX_TIER;
  if (isTierlessAffixType(old.type) || old.tier >= cap) {
    return { affixes, success: false, message: `精鍊印記只受理 T${cap} 以下的一般詞綴` };
  }

  const tier = old.tier + 1;
  const type = old.type as AffixType;
  const next = [...affixes];
  next[affixIndex] = { ...old, tier, value: rollAffixValue(tier, type) };

  return {
    affixes: next,
    success: true,
    message: `精鍊印記：${affixName(type)} 升至 T${tier}`,
  };
}

/**
 * § 46.7 突破印記：只受理 T5→T6（10%）與 T6→T7（2%）。
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
    return { affixes, success: false, message: '突破印記只受理 T5／T6 的詞綴' };
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
      ? `突破印記成功！${affixName(type)} 升至 T${tier}`
      : `突破印記失敗… ${affixName(type)} 掉回 T${tier}`,
  };
}

/**
 * § 46.8 工藝印記：整件裝備品質 +1%，上限 20%，必定成功。
 * 金幣由呼叫端扣（`POLISH_SIGIL_GOLD_COST`）—— 這裡只算品質。
 */
export function applyPolishSigil(quality: number): { quality: number; success: boolean; message: string } {
  if (quality >= POLISH_SIGIL_QUALITY_MAX) {
    return { quality, success: false, message: `品質已達 ${POLISH_SIGIL_QUALITY_MAX}%` };
  }
  const next = quality + POLISH_SIGIL_QUALITY_STEP;
  return { quality: next, success: true, message: `工藝印記：品質提升至 ${next}%` };
}
