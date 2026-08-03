/**
 * 角色統計（`37-statistics.md` § 37.2）。
 * 欄位**只能新增**，不可改變既有欄位語意 —— 遺產快照存的是當下的數字，
 * 語意一變，所有已封存的紀錄都會變成錯誤資訊（限制 77）。
 */
export interface CharacterStatistics {
  monstersKilled: number;
  bossesKilled: number;
  deathCount: number;
  equipmentCrafted: number;
  weaponEnhanceAttempts: number;
  armorEnhanceAttempts: number;
  weaponsBroken: number;
  armorsBroken: number;
  questsCompleted: number;
  totalGoldEarned: number;
  /** T7 武器掉落數（§ 37.1）。T7 僅 Boss 掉落，製作／購買不會增加 */
  tier7WeaponsLooted: number;
  /** T7 防具掉落數（§ 37.1）。盾牌／魔導書／臂甲雖佔手部欄位，計入此欄 */
  tier7ArmorsLooted: number;
}

export function createDefaultStatistics(): CharacterStatistics {
  return {
    monstersKilled: 0,
    bossesKilled: 0,
    deathCount: 0,
    equipmentCrafted: 0,
    weaponEnhanceAttempts: 0,
    armorEnhanceAttempts: 0,
    weaponsBroken: 0,
    armorsBroken: 0,
    questsCompleted: 0,
    totalGoldEarned: 0,
    tier7WeaponsLooted: 0,
    tier7ArmorsLooted: 0,
  };
}

/**
 * 舊存檔補齊：`mayana_prefs_<id>` 存的是新增欄位之前的物件，
 * 直接使用會讓新欄位是 `undefined`，之後 `+= 1` 變成 NaN 並一路寫進排行榜。
 */
export function normalizeStatistics(stored?: Partial<CharacterStatistics> | null): CharacterStatistics {
  return { ...createDefaultStatistics(), ...(stored ?? {}) };
}
