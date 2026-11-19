/**
 * 裝備強化成功率 — `06-equipment.md` § 6.9（武器）、§ 6.10（防具）。
 *
 * 武器與防具是兩套獨立系統，公式不同（`06-equipment.md` § 6.9／§ 6.10），不可合併簡化。
 */

/** 防具超出安定值後仍維持 1/2 的最高目標等級（§ 6.10 表格「安定值 0」欄 +1~+4 皆為 1/2） */
export const ARMOR_ENHANCE_FLAT_RATE_MAX_LEVEL = 4;

/** 一次強化判定的三種結果機率，三者合計 1 */
export interface EnhanceOdds {
  success: number;
  /** 等級維持、裝備保留 */
  noChange: number;
  destroy: number;
}

/** 武器目標等級達此值起改為 1/5 成功、2/5 無變化、2/5 消失（§ 6.9） */
export const WEAPON_NO_CHANGE_START_LEVEL = 10;

/**
 * 武器強化結果機率（§ 6.9）。
 * 安定值內必定成功；超出後 1/3 成功、2/3 消失；目標 +10 起 1/5 成功、2/5 無變化、2/5 消失。
 */
export function getWeaponEnhanceOdds(targetLevel: number, stability: number): EnhanceOdds {
  if (targetLevel <= stability) return { success: 1, noChange: 0, destroy: 0 };
  if (targetLevel >= WEAPON_NO_CHANGE_START_LEVEL) return { success: 1 / 5, noChange: 2 / 5, destroy: 2 / 5 };
  return { success: 1 / 3, noChange: 0, destroy: 2 / 3 };
}

/**
 * 防具強化成功率（§ 6.10）。
 * 安定值內必定成功；超出後 +1~+4 一律 1/2，+5 起為 1/(目標等級-1)。
 *
 * 注意：不可簡化成單一的 `1/(targetLevel-1)` —— 安定值 0 時 +1 會算出 1/0、+2 算出 1/1，
 * 兩者都變成必定成功，與 § 6.10 表格的 50% 不符。
 */
export function getArmorEnhanceRate(targetLevel: number, stability: number): number {
  if (targetLevel <= stability) return 1.0;
  if (targetLevel <= ARMOR_ENHANCE_FLAT_RATE_MAX_LEVEL) return 1 / 2;
  return 1 / (targetLevel - 1);
}

// === 飾品強化（項鍊／戒指，`06-equipment.md` § 6.10.1）===

/** 飾品強化每級提供的魔法抗性（%） */
export const ACCESSORY_MAGIC_RESIST_PER_LEVEL = 2;
/** 數值倍率的起始強化等級 */
export const ACCESSORY_MULTIPLIER_START_LEVEL = 4;
/** 數值倍率上限 */
export const ACCESSORY_MULTIPLIER_CAP = 1.5;

/**
 * 飾品強化提供的魔法抗性（%）：每 +1 給 2%。
 */
export function getAccessoryMagicResist(enhancement: number): number {
  return Math.max(0, enhancement) * ACCESSORY_MAGIC_RESIST_PER_LEVEL;
}

/**
 * 飾品強化的數值倍率：+3 以下無倍率，+4 起每級 +0.1，上限 ×1.5（+8 達成）。
 * 只作用於 `bonusHp` / `bonusMp` / `hpRegen` / `mpRegen`，不含額外屬性。
 */
export function getAccessoryStatMultiplier(enhancement: number): number {
  if (enhancement < ACCESSORY_MULTIPLIER_START_LEVEL) return 1;
  const raw = 1 + (enhancement - (ACCESSORY_MULTIPLIER_START_LEVEL - 1)) * 0.1;
  return Math.min(ACCESSORY_MULTIPLIER_CAP, Number(raw.toFixed(2)));
}
