/**
 * 遊戲邏輯唯一的亂數來源（`97-selfhosted-server.md` § 97.6）。
 * 預設為 seeded 產生器；server 以世界種子重設。
 */
export type RandomSource = () => number;

/** mulberry32：32-bit 種子，回傳 [0, 1) */
export function createSeededSource(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initialSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0];
  }
  return (Date.now() ^ 0x9e3779b9) >>> 0;
}

let source: RandomSource = createSeededSource(initialSeed());

export function setRandomSource(next: RandomSource): void {
  source = next;
}

export function reseed(seed: number): void {
  source = createSeededSource(seed);
}

/** [0, 1) */
export function random(): number {
  return source();
}

/** 整數閉區間 [min, max] */
export function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

/** 機率 p（0~1）命中 */
export function chance(p: number): boolean {
  return random() < p;
}

/** 百分比機率（0~100）命中 */
export function chancePercent(percent: number): boolean {
  return random() * 100 < percent;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(random() * arr.length)];
}
