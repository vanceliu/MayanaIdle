import { describe, expect, it } from 'vitest';
import {
  arenaSlotStart, EMPTY_ARENA_SLOTS, isArenaSlotUsed, markArenaSlotUsed, nextArenaSlotStart, refundArenaSlot,
} from '../arena';

/** 遊戲時間（UTC+8）2026-11-13 h:m */
const at = (h: number, m = 0) => Date.UTC(2026, 10, 13, h - 8, m);

describe('競技場票券場時段（§ 55.4）', () => {
  it('每 3 小時一個時段，起點在 00/03/06…21 點整', () => {
    expect(arenaSlotStart(at(0, 0))).toBe(at(0));
    expect(arenaSlotStart(at(2, 59))).toBe(at(0));
    expect(arenaSlotStart(at(3, 0))).toBe(at(3));
    expect(arenaSlotStart(at(14, 30))).toBe(at(12));
    expect(arenaSlotStart(at(23, 59))).toBe(at(21));
  });

  it('下一個時段起點；21 點後跨日到隔天 00 點', () => {
    expect(nextArenaSlotStart(at(4, 10))).toBe(at(6));
    expect(nextArenaSlotStart(at(22, 0))).toBe(at(24));
  });

  it('時段以 UTC 計算：UTC 16／19／22／01…點，即台灣時間 00／03／06／09…點', () => {
    expect(arenaSlotStart(Date.UTC(2026, 10, 13, 17, 30))).toBe(Date.UTC(2026, 10, 13, 16));
    expect(arenaSlotStart(Date.UTC(2026, 10, 14, 0, 30))).toBe(Date.UTC(2026, 10, 13, 22));
    expect(nextArenaSlotStart(Date.UTC(2026, 10, 14, 0, 30))).toBe(Date.UTC(2026, 10, 14, 1));
  });

  it('0.9.2 以前 UTC 主機記錄的時段（UTC 00／03／06…點起）一律視為未使用', () => {
    for (let h = 0; h < 24; h += 3) {
      const legacy = { slotStart: Date.UTC(2026, 10, 20, h), tiers: [4, 5, 6] as const };
      for (const offset of [0, 60, 120, 179]) {
        const now = Date.UTC(2026, 10, 20, h, offset);
        expect(isArenaSlotUsed({ ...legacy, tiers: [...legacy.tiers] }, 5, now)).toBe(false);
      }
    }
  });

  it('同時段用過即不給票券，下一時段重置', () => {
    const used = markArenaSlotUsed(EMPTY_ARENA_SLOTS, 5, at(4));
    expect(isArenaSlotUsed(used, 5, at(5, 59))).toBe(true);
    expect(isArenaSlotUsed(used, 4, at(5, 59))).toBe(false);
    expect(isArenaSlotUsed(used, 5, at(6))).toBe(false);
  });

  it('作廢退還只在同時段生效', () => {
    const used = markArenaSlotUsed(EMPTY_ARENA_SLOTS, 6, at(10));
    expect(isArenaSlotUsed(refundArenaSlot(used, 6, at(9)), 6, at(11))).toBe(false);
    expect(refundArenaSlot(used, 6, at(6))).toBe(used);
  });
});
