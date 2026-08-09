import { describe, it, expect } from 'vitest';
import { DamageNumberManager } from '../DamageNumber';

/**
 * 後蓋前（`48-vfx.md` § 48.7.3）。
 *
 * 多下判定會在幾十毫秒內連跳好幾個數字，全部留著會疊成一團 ——
 * 帶同一個 key 的新數字要把還在演的那個收掉。
 */
describe('傷害數字的後蓋前', () => {
  it('同一個 key 只留最新的一個', () => {
    const m = new DamageNumberManager();
    m.spawn(0, 0, 10, 'normal', 'monster-1');
    m.spawn(0, 0, 20, 'normal', 'monster-1');
    m.spawn(0, 0, 30, 'normal', 'monster-1');
    expect(m.activeCount).toBe(1);
    m.destroy();
  });

  it('不同怪的數字同時看得到，不互相取代', () => {
    const m = new DamageNumberManager();
    m.spawn(0, 0, 10, 'normal', 'monster-1');
    m.spawn(0, 0, 20, 'normal', 'monster-2');
    expect(m.activeCount).toBe(2);
    m.destroy();
  });

  it('沒帶 key 的照舊全部並存', () => {
    const m = new DamageNumberManager();
    m.spawn(0, 0, 10, 'normal');
    m.spawn(0, 0, 20, 'normal');
    expect(m.activeCount).toBe(2);
    m.destroy();
  });

  it('被取代掉的會回到池子，不會漏掉', () => {
    const m = new DamageNumberManager();
    m.spawn(0, 0, 10, 'normal', 'k');
    m.spawn(0, 0, 20, 'normal', 'k');
    /* 演完之後兩個都該回收 */
    m.update(2000);
    expect(m.activeCount).toBe(0);
    m.destroy();
  });
});
