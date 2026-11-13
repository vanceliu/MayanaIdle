import { describe, expect, it } from 'vitest';
import {
  arenaSlotStart, EMPTY_ARENA_SLOTS, isArenaSlotUsed, markArenaSlotUsed, nextArenaSlotStart, refundArenaSlot,
} from '../arena';

const at = (h: number, m = 0) => new Date(2026, 10, 13, h, m).getTime();

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
    expect(nextArenaSlotStart(at(22, 0))).toBe(new Date(2026, 10, 14, 0).getTime());
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
