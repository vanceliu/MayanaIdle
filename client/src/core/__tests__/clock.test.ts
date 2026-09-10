import { describe, it, expect, afterEach } from 'vitest';
import { gameNow, advanceMs, advanceTicks, setGameNow, currentTick, setClockSource, TICK_MS } from '../clock';

describe('core/clock（97 § 97.6 tick 時間）', () => {
  afterEach(() => setClockSource(() => Date.now()));

  it('內部時鐘由 advanceMs 推進，不隨 Date.now 變動', () => {
    setClockSource(null);
    setGameNow(0);
    expect(gameNow()).toBe(0);
    advanceMs(450);
    expect(gameNow()).toBe(450);
    expect(currentTick()).toBe(1);
    advanceTicks(2);
    expect(gameNow()).toBe(450 + 2 * TICK_MS);
    expect(currentTick()).toBe(3);
  });

  it('TICK_MS 為 300', () => {
    expect(TICK_MS).toBe(300);
  });
});
