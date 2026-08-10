/**
 * 試驗場的木樁參數與量測狀態（`50-training-ground.md` § 50.4~§ 50.5）。
 *
 * **不進 IndexedDB**：量測結果是暫時的，面板關掉即消失（§ 50.6）。
 */
import { create } from 'zustand';
import {
  DEFAULT_DUMMY_SPEC,
  DUMMY_COUNT_MAX,
  DUMMY_COUNT_MIN,
  clampInt,
  normalizeDummySpec,
  type TrainingDummySpec,
} from '../models/trainingGround';

export interface TrainingMeasurement {
  running: boolean;
  /** null＝尚未開始過 */
  startedAt: number | null;
  /** null＝仍在進行中（計時到 `Date.now()`） */
  stoppedAt: number | null;
  totalDamage: number;
  /** 命中的判定次數 */
  hitCount: number;
  /** 出手判定次數＝命中率的分母。雙刀打兩下算兩次（§ 50.5.2） */
  attemptCount: number;
  /** 區間開始當下的 MP，用來算淨消耗 */
  mpAtStart: number;
}

const EMPTY_MEASUREMENT: TrainingMeasurement = {
  running: false,
  startedAt: null,
  stoppedAt: null,
  totalDamage: 0,
  hitCount: 0,
  attemptCount: 0,
  mpAtStart: 0,
};

export interface TrainingGroundState {
  spec: TrainingDummySpec;
  count: number;
  /** 進入試驗場前所在的城鎮，離開時回到這裡（§ 50.2） */
  returnRegionId: string | null;
  measurement: TrainingMeasurement;

  setSpec: (patch: Partial<TrainingDummySpec>) => void;
  setCount: (count: number) => void;
  setReturnRegion: (regionId: string | null) => void;

  /** 開始量測：統計歸零、記下起始 MP */
  start: (currentMp: number) => void;
  stop: () => void;
  /** 木樁全滅時由戰鬥迴圈呼叫，等同按下停止 */
  stopIfRunning: () => void;
  reset: () => void;

  /**
   * 記一次對木樁的攻擊結果。
   *
   * `attempts` 是這一發的判定次數（雙刀兩下＝2），`hits` 是其中命中的次數。
   * DoT 不判定命中，因此以 `attempts: 0, hits: 0` 只累加傷害。
   */
  recordDamage: (damage: number, attempts: number, hits: number) => void;
}

export const useTrainingGroundStore = create<TrainingGroundState>((set, get) => ({
  spec: { ...DEFAULT_DUMMY_SPEC },
  count: 1,
  returnRegionId: null,
  measurement: { ...EMPTY_MEASUREMENT },

  setSpec: (patch) => set(state => ({ spec: normalizeDummySpec({ ...state.spec, ...patch }) })),
  setCount: (count) => set({ count: clampInt(count, DUMMY_COUNT_MIN, DUMMY_COUNT_MAX) }),
  setReturnRegion: (regionId) => set({ returnRegionId: regionId }),

  start: (currentMp) => set({
    measurement: { ...EMPTY_MEASUREMENT, running: true, startedAt: Date.now(), mpAtStart: currentMp },
  }),

  stop: () => set(state => (
    state.measurement.running
      ? { measurement: { ...state.measurement, running: false, stoppedAt: Date.now() } }
      : state
  )),

  stopIfRunning: () => {
    if (get().measurement.running) get().stop();
  },

  reset: () => set({ measurement: { ...EMPTY_MEASUREMENT } }),

  recordDamage: (damage, attempts, hits) => set(state => {
    // 沒在量測就不記 —— 按下「開始」之前造成的傷害一律不計入（§ 50.5.1）
    if (!state.measurement.running) return state;
    return {
      measurement: {
        ...state.measurement,
        totalDamage: state.measurement.totalDamage + damage,
        attemptCount: state.measurement.attemptCount + attempts,
        hitCount: state.measurement.hitCount + hits,
      },
    };
  }),
}));

/**
 * 現在可不可以補滿 HP/MP（`50-training-ground.md` § 50.5.3）。
 *
 * 量測中不給補：MP 淨消耗是拿「區間開始的 MP」減「現在的 MP」，
 * 中途灌回滿值會讓它變成負數，整欄數字報廢且看不出原因。
 */
export function canRestore(m: TrainingMeasurement): boolean {
  return !m.running;
}

/** 量測區間長度（毫秒）。進行中就算到現在 */
export function getElapsedMs(m: TrainingMeasurement, now: number = Date.now()): number {
  if (m.startedAt === null) return 0;
  return Math.max(0, (m.stoppedAt ?? now) - m.startedAt);
}

export interface TrainingReadout {
  elapsedSeconds: number;
  totalDamage: number;
  dps: number;
  /** 0~100；沒有任何判定時為 null（不是 0，那會被讀成「全 MISS」） */
  hitRate: number | null;
  /** 每秒 MP 淨消耗；正值代表在燒 MP。尚未計時時為 null */
  mpPerSecond: number | null;
}

export function getReadout(
  m: TrainingMeasurement,
  currentMp: number,
  now: number = Date.now(),
): TrainingReadout {
  const elapsedSeconds = getElapsedMs(m, now) / 1000;
  return {
    elapsedSeconds,
    totalDamage: m.totalDamage,
    dps: elapsedSeconds > 0 ? m.totalDamage / elapsedSeconds : 0,
    hitRate: m.attemptCount > 0 ? (m.hitCount / m.attemptCount) * 100 : null,
    mpPerSecond: elapsedSeconds > 0 ? (m.mpAtStart - currentMp) / elapsedSeconds : null,
  };
}
