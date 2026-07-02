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
  };
}
