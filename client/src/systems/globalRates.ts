/**
 * 全域倍率的作用點（`19-account-character.md` § 19.9）。
 * 每個倍率只作用於一條公式；倍率以參數注入，預設取 `config.ts`。
 */
import {
  GOLD_RATE_MULTIPLIER,
  EXP_RATE_MULTIPLIER,
  SPAWN_RATE_MULTIPLIER,
  MONSTER_HP_MULTIPLIER,
  MONSTER_ATTACK_MULTIPLIER,
  BOSS_SPAWN_RATE_MULTIPLIER,
} from '../config';

/** `27-drop-table.md` § 27.1：金幣單次上限 500，上限與抽值同乘全域倍率 */
export const GOLD_DROP_CAP = 500;

/** `28-monster-stats.md` § 28.1：擊殺經驗結算倍率 ×3 */
export const KILL_EXP_MULTIPLIER = 3;

/** `26-spawn-pressure.md` § 26.4：Boss 生成基礎機率 */
export const BOSS_SPAWN_BASE_CHANCE = 0.1;

/** 怪物金幣掉落：min(抽值, 500) × 詞綴加成 × 全域倍率 */
export function settleGoldDrop(baseGold: number, affixMultiplier: number, globalRate = GOLD_RATE_MULTIPLIER): number {
  return Math.floor(Math.min(baseGold, GOLD_DROP_CAP) * affixMultiplier * globalRate);
}

/** `36-quest-system.md` § 36.3：任務金幣獎勵 × 全域金幣倍率 */
export function settleQuestGold(amount: number, globalRate = GOLD_RATE_MULTIPLIER): number {
  return Math.floor(amount * globalRate);
}

/** `28-monster-stats.md` § 28.1 ＋ `04-character.md` § 4.11：基礎 × 3 × 回鍋 × 全域經驗倍率 */
export function settleKillExp(baseExp: number, restedMultiplier: number, globalRate = EXP_RATE_MULTIPLIER): number {
  return Math.floor(baseExp * KILL_EXP_MULTIPLIER * restedMultiplier * globalRate);
}

/** `26-spawn-pressure.md` § 26.2：判定間隔 = 基礎 / ((1 + Pressure × 0.2) × 全域生成倍率) */
export function getSpawnInterval(baseIntervalMs: number, pressure: number, globalRate = SPAWN_RATE_MULTIPLIER): number {
  return baseIntervalMs / ((1 + pressure * 0.2) * globalRate);
}

/** `26-spawn-pressure.md` § 26.4：min(100%, 10% × 全域 Boss 生成倍率) */
export function getBossSpawnChance(globalRate = BOSS_SPAWN_RATE_MULTIPLIER): number {
  return Math.min(1, BOSS_SPAWN_BASE_CHANCE * globalRate);
}

export interface MonsterStatRates {
  hp: number;
  attack: number;
}

export const DEFAULT_MONSTER_STAT_RATES: MonsterStatRates = {
  hp: MONSTER_HP_MULTIPLIER,
  attack: MONSTER_ATTACK_MULTIPLIER,
};

/** `28-monster-stats.md` § 28.1：實例 HP 與攻擊力區間 = max(1, round(seed × 倍率)) */
export function scaleMonsterStat(seedValue: number, rate: number): number {
  return Math.max(1, Math.round(seedValue * rate));
}
