/**
 * 試驗場（`50-training-ground.md`）。
 *
 * 這是**工具不是內容**：木樁零掉落、零經驗、零金幣、不進統計數據。
 * 任何「給獎勵」的想法都違反 § 50.1，會讓它變成零風險掛機刷怪點。
 */
import type { ElementType, MonsterSize } from './monster';

export const TRAINING_GROUND_REGION_ID = 'training-ground';
/** 城鎮那側的入口 NPC（開「進入試驗場」面板），沿用 `MapNpc.facility` 這條路 */
export const TRAINING_GROUND_FACILITY = 'training-ground';
/** 場內的管理員 NPC（開木樁設定＋數據面板）。與入口是兩個不同的面板，故兩個 id */
export const TRAINING_DUMMY_FACILITY = 'training-dummy';

/** 木樁可調參數（§ 50.4.2）。每一項都對應一條實際會改變數字的公式 */
export interface TrainingDummySpec {
  /** 0~200。超過 75 的部分轉迴避（`21-combat-formula.md` § 21.5） */
  defense: number;
  /** null＝無限血量（§ 50.4.3），木樁不會死，只能手動停止量測 */
  hp: number | null;
  /** 1~100。只影響命中率的等級差修正（`21-combat-formula.md` § 21.7） */
  level: number;
  /** 武器基傷走 smallMonsterDamage 或 largeMonsterDamage（`06-equipment.md` § 6.11） */
  size: MonsterSize;
  element: ElementType;
}

export const DUMMY_DEFENSE_MIN = 0;
export const DUMMY_DEFENSE_MAX = 200;
export const DUMMY_LEVEL_MIN = 1;
export const DUMMY_LEVEL_MAX = 100;
export const DUMMY_HP_MIN = 1;
export const DUMMY_HP_MAX = 100_000_000;
export const DUMMY_COUNT_MIN = 1;
/** 上限對齊流星雨的 maxTargets 8（`22-basic-magic.md`），再多也驗證不到新東西 */
export const DUMMY_COUNT_MAX = 8;

/**
 * 「無限血量」實際填進 `MonsterInstance` 的數值。
 *
 * 不用 `Infinity`：血條百分比會算出 NaN，傷害數字也會被污染。
 * 用一個大到打不完的有限值，血條看起來永遠是滿的，這正是想要的效果。
 */
export const DUMMY_INFINITE_HP = 1_000_000_000;

/** 防禦超過這個值開始轉迴避，介面必須警告（§ 50.4.2） */
export const DEFENSE_OVERFLOW_THRESHOLD = 75;

/**
 * 木樁的固定站位（`training-ground.json` 的可通行區為 x 1~18、y 1~13）。
 *
 * 中心取 (10, 7)：左邊到牆 9 格、右邊 8 格，**兩側都 ≥ 8**，
 * 流星雨半徑 8 的邊界左右都測得到（§ 50.3）。出生點與管理員在右側 x 16~17，
 * 所以往左讓一格不影響走過去的距離。
 *
 * 兩格一間隔而不是排成一列：近戰要站得進去每一隻旁邊，
 * 而八隻全落在同一個半徑 8 的圓內，`maxTargets` 上限才驗證得到。
 * 順序即召喚順序，數量少時從中心往外長。
 */
export const DUMMY_SLOTS: readonly { x: number; y: number }[] = [
  { x: 10, y: 7 },
  { x: 12, y: 7 },
  { x: 8, y: 7 },
  { x: 10, y: 5 },
  { x: 10, y: 9 },
  { x: 12, y: 5 },
  { x: 8, y: 9 },
  { x: 12, y: 9 },
];

export const DEFAULT_DUMMY_SPEC: TrainingDummySpec = {
  defense: 0,
  hp: null,
  level: 1,
  size: 'small',
  element: 'none',
};

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function normalizeDummySpec(spec: TrainingDummySpec): TrainingDummySpec {
  return {
    defense: clampInt(spec.defense, DUMMY_DEFENSE_MIN, DUMMY_DEFENSE_MAX),
    hp: spec.hp === null ? null : clampInt(spec.hp, DUMMY_HP_MIN, DUMMY_HP_MAX),
    level: clampInt(spec.level, DUMMY_LEVEL_MIN, DUMMY_LEVEL_MAX),
    size: spec.size,
    element: spec.element,
  };
}

/** 防禦溢出轉迴避（`21-combat-formula.md` § 21.5），介面用來顯示警告 */
export function getDefenseOverflowDodge(defense: number): number {
  if (defense <= DEFENSE_OVERFLOW_THRESHOLD) return 0;
  return Math.floor((defense - DEFENSE_OVERFLOW_THRESHOLD) / 5);
}
