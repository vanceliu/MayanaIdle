/**
 * 全域倍率的作用點（`19-account-character.md` § 19.9）。
 * 每個倍率只作用於一條公式；倍率以參數注入，預設取 `config.ts`。
 */
import { rates } from '../core/rates';

/** `27-drop-table.md` § 27.1：金幣單次上限 500，上限與抽值同乘全域倍率 */
export const GOLD_DROP_CAP = 500;

/** `28-monster-stats.md` § 28.1：擊殺經驗結算倍率 ×3 */
export const KILL_EXP_MULTIPLIER = 3;

/** `26-spawn-pressure.md` § 26.4：Boss 生成基礎機率 */
export const BOSS_SPAWN_BASE_CHANCE = 0.1;

/** 怪物金幣掉落：min(抽值, 500) × 詞綴加成 × 全域倍率 */
export function settleGoldDrop(baseGold: number, affixMultiplier: number, globalRate = rates.gold): number {
  return Math.floor(Math.min(baseGold, GOLD_DROP_CAP) * affixMultiplier * globalRate);
}

/** `36-quest-system.md` § 36.3：任務金幣獎勵 × 全域金幣倍率 */
export function settleQuestGold(amount: number, globalRate = rates.gold): number {
  return Math.floor(amount * globalRate);
}

/** `28-monster-stats.md` § 28.1 ＋ `04-character.md` § 4.11：基礎 × 3 × 回鍋 × 全域經驗倍率 */
export function settleKillExp(baseExp: number, restedMultiplier: number, globalRate = rates.exp): number {
  return Math.floor(baseExp * KILL_EXP_MULTIPLIER * restedMultiplier * globalRate);
}

/**
 * `26-spawn-pressure.md` § 26.2：一波的隻數。
 *
 * `rolled` 是停留時間擲出的 1~3 再加上 Pressure，先夾在地圖上限內，
 * 最後才乘全域生成倍率 —— 倍率作用在上限**之後**，大於 1 時場上隻數會超過
 * § 26.2 的硬上限，那正是開服者調高這個值要的效果。最少 1 隻。
 */
export function getWaveSize(rolled: number, maxMonsters: number, globalRate = rates.spawn): number {
  return Math.max(1, Math.floor(Math.min(rolled, maxMonsters) * globalRate));
}

/** `26-spawn-pressure.md` § 26.4：min(100%, 10% × 全域 Boss 生成倍率) */
export function getBossSpawnChance(globalRate = rates.bossSpawn): number {
  return Math.min(1, BOSS_SPAWN_BASE_CHANCE * globalRate);
}

export interface MonsterStatRates {
  hp: number;
  attack: number;
}

/** 每次生成時讀當下的全域倍率（`server.properties` 即時生效） */
export function defaultMonsterStatRates(): MonsterStatRates {
  return { hp: rates.monsterHp, attack: rates.monsterAttack };
}

/** `28-monster-stats.md` § 28.1：實例 HP 與攻擊力區間 = max(1, round(seed × 倍率)) */
export function scaleMonsterStat(seedValue: number, rate: number): number {
  return Math.max(1, Math.round(seedValue * rate));
}
