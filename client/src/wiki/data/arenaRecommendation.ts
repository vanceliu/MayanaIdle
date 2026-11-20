import type { ClassName } from '../../models/character';

/**
 * 競技場最低推薦裝備（`44-dps-prediction.md` § 44.5 最低推薦裝備）：
 * 單人清完第 30 波、5 場至少 4 場的最低配裝階梯，與達標場次的橙色藥水用量。
 */
export const ARENA_RECOMMEND_TARGET_WAVE = 30;

export interface ArenaRecommendation {
  tier: 4 | 5 | 6;
  className: ClassName;
  /** 裝備階級；等於段位時為該階製作品 */
  gearTier: number;
  weaponEnhance: number;
  armorEnhance: number;
  /** 詞綴階級（製作品取該階製作的平均階級；T5／T6 製作上限為 T6） */
  affixTier: number;
  potionsMedian: number;
  potionsMax: number;
}

export const ARENA_RECOMMENDATIONS: ArenaRecommendation[] = [
  { tier: 4, className: 'knight', gearTier: 4, weaponEnhance: 0, armorEnhance: 0, affixTier: 3, potionsMedian: 389, potionsMax: 471 },
  { tier: 4, className: 'elf', gearTier: 4, weaponEnhance: 6, armorEnhance: 5, affixTier: 3, potionsMedian: 234, potionsMax: 273 },
  { tier: 4, className: 'thief', gearTier: 4, weaponEnhance: 6, armorEnhance: 5, affixTier: 3, potionsMedian: 226, potionsMax: 246 },
  { tier: 4, className: 'elementalist', gearTier: 4, weaponEnhance: 0, armorEnhance: 0, affixTier: 3, potionsMedian: 253, potionsMax: 309 },
  { tier: 4, className: 'priest', gearTier: 4, weaponEnhance: 0, armorEnhance: 0, affixTier: 3, potionsMedian: 308, potionsMax: 340 },
  { tier: 5, className: 'knight', gearTier: 5, weaponEnhance: 6, armorEnhance: 5, affixTier: 4, potionsMedian: 292, potionsMax: 303 },
  { tier: 5, className: 'elf', gearTier: 5, weaponEnhance: 6, armorEnhance: 5, affixTier: 4, potionsMedian: 346, potionsMax: 361 },
  { tier: 5, className: 'thief', gearTier: 5, weaponEnhance: 6, armorEnhance: 5, affixTier: 4, potionsMedian: 361, potionsMax: 372 },
  { tier: 5, className: 'elementalist', gearTier: 5, weaponEnhance: 0, armorEnhance: 0, affixTier: 4, potionsMedian: 505, potionsMax: 529 },
  { tier: 5, className: 'priest', gearTier: 4, weaponEnhance: 0, armorEnhance: 0, affixTier: 3, potionsMedian: 370, potionsMax: 380 },
  { tier: 6, className: 'knight', gearTier: 6, weaponEnhance: 6, armorEnhance: 5, affixTier: 4, potionsMedian: 510, potionsMax: 544 },
  { tier: 6, className: 'elf', gearTier: 6, weaponEnhance: 6, armorEnhance: 5, affixTier: 6, potionsMedian: 446, potionsMax: 501 },
  { tier: 6, className: 'thief', gearTier: 6, weaponEnhance: 6, armorEnhance: 5, affixTier: 4, potionsMedian: 496, potionsMax: 572 },
  { tier: 6, className: 'elementalist', gearTier: 6, weaponEnhance: 6, armorEnhance: 5, affixTier: 4, potionsMedian: 467, potionsMax: 506 },
  { tier: 6, className: 'priest', gearTier: 6, weaponEnhance: 6, armorEnhance: 5, affixTier: 4, potionsMedian: 286, potionsMax: 311 },
];

/** 「T5 製作品 武器 +6／防具 +5、詞綴 T4」 */
export function formatArenaGear(r: ArenaRecommendation): string {
  const kind = r.gearTier === r.tier ? `T${r.gearTier} 製作品` : `T${r.gearTier} 裝備`;
  const enhance = r.weaponEnhance === 0 && r.armorEnhance === 0 ? '+0' : `武器 +${r.weaponEnhance}／防具 +${r.armorEnhance}`;
  return `${kind} ${enhance}、詞綴 T${r.affixTier}`;
}
