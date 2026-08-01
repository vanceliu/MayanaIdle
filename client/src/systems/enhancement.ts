/**
 * 裝備強化成功率 — `06-equipment.md` § 6.9（武器）、§ 6.10（防具）。
 *
 * 武器與防具是兩套獨立系統，公式不同（`99-ai-constraints.md` 第 32 條），不可合併簡化。
 */

/** 防具超出安定值後仍維持 1/2 的最高目標等級（§ 6.10 表格「安定值 0」欄 +1~+4 皆為 1/2） */
export const ARMOR_ENHANCE_FLAT_RATE_MAX_LEVEL = 4;

/**
 * 武器強化成功率（§ 6.9）。
 * 安定值內必定成功；超出後固定 1/3 成功、2/3 武器消失。
 */
export function getWeaponEnhanceRate(targetLevel: number, stability: number): number {
  if (targetLevel <= stability) return 1.0;
  return 1 / 3;
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
