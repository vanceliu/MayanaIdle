/**
 * 懸賞「掉兩次取比較好」的裝備比較（`53-bounty-contract.md` § 53.6）。
 */
import { getAffixCategoryOf, getAffixTierRange, isTierlessAffixType, type Affix, type AffixCategory } from './affix';
import type { EquipmentInstance } from './equipment';
import { isEquippableBy, type EquipmentFilterSubject } from './villageScript';

export const BOUNTY_COMPARE_CRITERIA = ['wearable', 'preferred', 'topTier', 'tierSum', 'stability', 'rangePos'] as const;
export type BountyCompareCriterion = typeof BOUNTY_COMPARE_CRITERIA[number];

export const BOUNTY_COMPARE_LABELS: Record<BountyCompareCriterion, string> = {
  wearable: '本角色穿得起的',
  preferred: '偏好詞綴條數',
  topTier: '最高詞綴階級',
  tierSum: '詞綴階級加總',
  stability: '安定值（再比隨機額外防禦）',
  rangePos: '詞綴區間位置加總',
};

export interface BountyCompareSettings {
  /** 偏好詞綴 id */
  affixTypes: string[];
  /** 比較順序；每個條件出現一次 */
  order: { key: BountyCompareCriterion; enabled: boolean }[];
}

export function defaultBountyCompareSettings(): BountyCompareSettings {
  return { affixTypes: [], order: BOUNTY_COMPARE_CRITERIA.map(key => ({ key, enabled: true })) };
}

/** 存檔或 client 送來的設定：去掉不認得的條件、補上缺的條件（排在最後、啟用） */
export function normalizeBountyCompareSettings(raw: unknown): BountyCompareSettings {
  const base = defaultBountyCompareSettings();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as { affixTypes?: unknown; order?: unknown };
  const affixTypes = Array.isArray(r.affixTypes)
    ? [...new Set(r.affixTypes.filter((t): t is string => typeof t === 'string'))]
    : [];
  const order: BountyCompareSettings['order'] = [];
  if (Array.isArray(r.order)) {
    for (const item of r.order) {
      const key = (item as { key?: unknown })?.key;
      if (!BOUNTY_COMPARE_CRITERIA.includes(key as BountyCompareCriterion)) continue;
      if (order.some(o => o.key === key)) continue;
      order.push({ key: key as BountyCompareCriterion, enabled: (item as { enabled?: unknown }).enabled !== false });
    }
  }
  for (const key of BOUNTY_COMPARE_CRITERIA) {
    if (!order.some(o => o.key === key)) order.push({ key, enabled: true });
  }
  return { affixTypes, order };
}

/** 無 Tier 的詞綴（特殊詞綴、額外屬性）視為 T5 */
const TIERLESS_AS_TIER = 5;

function affixTier(a: Affix): number {
  return isTierlessAffixType(a.type) ? TIERLESS_AS_TIER : a.tier;
}

function rangePosition(a: Affix, category: AffixCategory): number {
  const range = getAffixTierRange(a, category);
  if (!range || range.max <= range.min) return 0;
  return (a.value - range.min) / (range.max - range.min);
}

export interface BountyCompareContext {
  settings: BountyCompareSettings;
  subject: EquipmentFilterSubject;
}

/** 正數＝a 較好、負數＝b 較好、0＝相同 */
function compareBy(key: BountyCompareCriterion, a: EquipmentInstance, b: EquipmentInstance, ctx: BountyCompareContext): number {
  const affA = a.affixes ?? [];
  const affB = b.affixes ?? [];
  switch (key) {
    case 'wearable':
      return Number(isEquippableBy(a, ctx.subject)) - Number(isEquippableBy(b, ctx.subject));
    case 'preferred': {
      const wanted = new Set(ctx.settings.affixTypes);
      if (wanted.size === 0) return 0;
      return affA.filter(x => wanted.has(x.type)).length - affB.filter(x => wanted.has(x.type)).length;
    }
    case 'topTier': {
      const topA = Math.max(0, ...affA.map(affixTier));
      const topB = Math.max(0, ...affB.map(affixTier));
      if (topA !== topB) return topA - topB;
      return affA.filter(x => affixTier(x) === topA).length - affB.filter(x => affixTier(x) === topB).length;
    }
    case 'tierSum':
      return affA.reduce((s, x) => s + affixTier(x), 0) - affB.reduce((s, x) => s + affixTier(x), 0);
    case 'stability': {
      const diff = (a.stability ?? 0) - (b.stability ?? 0);
      return diff !== 0 ? diff : (a.defenseBonus ?? 0) - (b.defenseBonus ?? 0);
    }
    case 'rangePos':
      return affA.reduce((s, x) => s + rangePosition(x, getAffixCategoryOf(a)), 0)
        - affB.reduce((s, x) => s + rangePosition(x, getAffixCategoryOf(b)), 0);
  }
}

/** § 53.6.2：依設定順序逐條比較，全部相同留第一件 */
export function pickBetterBountyEquipment(first: EquipmentInstance, second: EquipmentInstance, ctx: BountyCompareContext): EquipmentInstance {
  for (const { key, enabled } of ctx.settings.order) {
    if (!enabled) continue;
    const result = compareBy(key, first, second, ctx);
    if (result > 0) return first;
    if (result < 0) return second;
  }
  return first;
}
