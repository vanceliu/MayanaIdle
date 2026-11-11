import { rates } from '../core/rates';

export interface PressureState {
  pressure: number;
  maxMonsters: number;
}

const BASE_MAX_MONSTERS = 3;
const MAX_MONSTERS_CAP = 10;

/** 單人每推進 1 級 Pressure 所需的擊殺數；組隊時乘以在場人數（`26-spawn-pressure.md` § 26.3） */
const PRESSURE_KILL_STEP = 100;
/** 掉落倍率的 Pressure 計算上限（maxMonsters 與生成間隔不套用） */
export const PRESSURE_DROP_CAP = 7;

/**
 * Pressure 的輸入是**該地圖的累積擊殺數**，不是停留時間
 * —— 停留時間會讓站著不動的角色與滿裝角色以同速推進，
 * 玩家的 DPS 因此完全兌現不到產出（`26-spawn-pressure.md` § 26.3）。
 * `members`：實例在場人數，門檻乘以它。
 */
export function calculatePressure(areaKills: number, globalRate = rates.pressure, members = 1): PressureState {
  // 累積擊殺數 × 全域 Pressure 倍率再套門檻；倍率 0 時 Pressure 恆為 0
  const pressure = Math.max(0, Math.floor((areaKills * globalRate) / (PRESSURE_KILL_STEP * Math.max(1, members))));
  const maxMonsters = Math.min(MAX_MONSTERS_CAP, BASE_MAX_MONSTERS + pressure);

  return { pressure, maxMonsters };
}

/** 推進到下一級 Pressure 所需的累積擊殺數；全域倍率 ≤ 0 時 Pressure 恆為 0，回傳 null */
export function getNextPressureKills(pressure: number, globalRate = rates.pressure, members = 1): number | null {
  if (globalRate <= 0) return null;
  return Math.ceil(((pressure + 1) * PRESSURE_KILL_STEP * Math.max(1, members)) / globalRate);
}

/** 人數變動時的累積擊殺數：× 新人數 ÷ 舊人數，無條件捨去（`26-spawn-pressure.md` § 26.3「人數變動」） */
export function rescalePressureKills(kills: number, fromMembers: number, toMembers: number): number {
  if (fromMembers <= 0 || toMembers <= 0 || fromMembers === toMembers) return kills;
  return Math.floor((kills * toMembers) / fromMembers);
}

/** 隊伍實例的怪物上限（`97-selfhosted-server.md` § 97.7.1）：一人時等於 § 26.2 */
export const PARTY_MAX_MONSTERS_CAP = 20;
export const PARTY_EXTRA_PER_MEMBER = 2;

export function partyMaxMonsters(pressure: number, partySize: number): number {
  if (partySize <= 1) return Math.min(MAX_MONSTERS_CAP, BASE_MAX_MONSTERS + pressure);
  return Math.min(PARTY_MAX_MONSTERS_CAP, BASE_MAX_MONSTERS + pressure + (partySize - 1) * PARTY_EXTRA_PER_MEMBER);
}

/** `26-spawn-pressure.md` § 26.3 掉落倍率，是 `27-drop-table.md` § 27.1 掉寶倍率的一個因子 */
export function getPressureDropMultiplier(pressure: number): number {
  return 1 + Math.min(pressure, PRESSURE_DROP_CAP) * 0.2;
}
