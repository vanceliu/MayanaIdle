/**
 * 執行期的全域倍率（`19-account-character.md` § 19.9）。
 * 預設取 `config.ts` 常數；server 啟動時以 `server.properties` 覆寫（`97-selfhosted-server.md` § 97.2）。
 */
import {
  GOLD_RATE_MULTIPLIER,
  DROP_RATE_MULTIPLIER,
  EXP_RATE_MULTIPLIER,
  PRESSURE_RATE_MULTIPLIER,
  SPAWN_RATE_MULTIPLIER,
  MONSTER_HP_MULTIPLIER,
  MONSTER_ATTACK_MULTIPLIER,
  BOSS_SPAWN_RATE_MULTIPLIER,
} from '../config';

export interface GlobalRates {
  gold: number;
  drop: number;
  exp: number;
  pressure: number;
  spawn: number;
  monsterHp: number;
  monsterAttack: number;
  bossSpawn: number;
}

export const DEFAULT_RATES: Readonly<GlobalRates> = Object.freeze({
  gold: GOLD_RATE_MULTIPLIER,
  drop: DROP_RATE_MULTIPLIER,
  exp: EXP_RATE_MULTIPLIER,
  pressure: PRESSURE_RATE_MULTIPLIER,
  spawn: SPAWN_RATE_MULTIPLIER,
  monsterHp: MONSTER_HP_MULTIPLIER,
  monsterAttack: MONSTER_ATTACK_MULTIPLIER,
  bossSpawn: BOSS_SPAWN_RATE_MULTIPLIER,
});

export const rates: GlobalRates = { ...DEFAULT_RATES };

export function setRates(next: Partial<GlobalRates>): void {
  Object.assign(rates, next);
}

export function resetRates(): void {
  Object.assign(rates, DEFAULT_RATES);
}
