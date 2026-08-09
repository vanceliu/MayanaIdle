import { describe, it, expect } from 'vitest';
import { DamageNumberManager } from '../DamageNumber';

/**
 * 多下判定的數字排法（`48-vfx.md` § 48.7.3）。
 *
 * **每一下都要看得完整** —— 後面蓋掉前面的話等於少跳了幾下。
 * 但錯開的時間換不到足夠距離（100ms 只有 5px，字高 14），所以要明確攤開。
 */
describe('多下判定的傷害數字', () => {
  it('連續多下全部留著，不會互相取代', () => {
    const m = new DamageNumberManager();
    for (let i = 0; i < 3; i++) m.spawn(0, 0, 10, 'normal', { index: i, count: 3 });
    expect(m.activeCount).toBe(3);
    m.destroy();
  });

  it('左右攤開，三個數字不會落在同一點', () => {
    const m = new DamageNumberManager();
    const xs: number[] = [];
    for (let i = 0; i < 3; i++) {
      m.spawn(100, 50, 10, 'normal', { index: i, count: 3 });
      xs.push(m.lastSpawnX);
    }
    expect(new Set(xs).size).toBe(3);
    /* 以落點為中心左右分開，不是全部往同一邊擠 */
    expect(Math.min(...xs)).toBeLessThan(100);
    expect(Math.max(...xs)).toBeGreaterThan(100);
    m.destroy();
  });

  it('逐下抬高，順序讀得出來', () => {
    const m = new DamageNumberManager();
    const ys: number[] = [];
    for (let i = 0; i < 3; i++) {
      m.spawn(100, 50, 10, 'normal', { index: i, count: 3 });
      ys.push(m.lastSpawnY);
    }
    expect(ys[1]).toBeLessThan(ys[0]);
    expect(ys[2]).toBeLessThan(ys[1]);
    m.destroy();
  });

  it('單下維持原本的隨機偏移，不受多下的排法影響', () => {
    const m = new DamageNumberManager();
    m.spawn(100, 50, 10, 'normal', { index: 0, count: 1 });
    expect(m.lastSpawnY).toBe(50);
    m.destroy();
  });

  it('演完全部回收', () => {
    const m = new DamageNumberManager();
    for (let i = 0; i < 3; i++) m.spawn(0, 0, 10, 'normal', { index: i, count: 3 });
    m.update(2000);
    expect(m.activeCount).toBe(0);
    m.destroy();
  });
});
