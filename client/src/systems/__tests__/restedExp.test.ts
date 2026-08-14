import { describe, it, expect } from 'vitest';
import {
  accrueRestedExp,
  drainRestedExp,
  getRestedExpMultiplier,
  getRestedExpRemaining,
  isRestedExpActive,
  RESTED_EXP_CAP_MS,
} from '../restedExp';
import type { Character } from '../../models/character';

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function makeChar(over: Partial<Character> = {}): Character {
  return {
    userId: 1, name: 'T', className: 'knight', level: 1, exp: 0, expToNext: 100,
    hp: 30, maxHp: 30, mp: 10, maxMp: 10,
    baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'a', currentZone: 'z', currentRegion: 'r', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: NOW, createdAt: NOW,
    ...over,
  };
}

describe('回鍋經驗加倍（`04-character.md` § 4.11）', () => {
  describe('累積', () => {
    it('離線 1 分鐘換 30 秒加倍', () => {
      const char = accrueRestedExp(makeChar({ lastSeenAt: NOW - 60_000 }), NOW);
      expect(char.restedExpMs).toBe(30_000);
      expect(char.lastSeenAt).toBe(NOW);
    });

    it('離線 3 小時換 1.5 小時加倍', () => {
      const char = accrueRestedExp(makeChar({ lastSeenAt: NOW - 3 * HOUR }), NOW);
      expect(char.restedExpMs).toBe(1.5 * HOUR);
    });

    it('存量疊加在既有存量之上', () => {
      const char = accrueRestedExp(
        makeChar({ lastSeenAt: NOW - 2 * HOUR, restedExpMs: 1 * HOUR }), NOW);
      expect(char.restedExpMs).toBe(2 * HOUR);
    });

    it('上限 12 小時，超出的捨棄不遞延', () => {
      expect(RESTED_EXP_CAP_MS).toBe(12 * HOUR);
      const char = accrueRestedExp(makeChar({ lastSeenAt: NOW - 100 * HOUR }), NOW);
      expect(char.restedExpMs).toBe(RESTED_EXP_CAP_MS);
    });

    it('離線 24 小時剛好填滿上限', () => {
      const char = accrueRestedExp(makeChar({ lastSeenAt: NOW - 24 * HOUR }), NOW);
      expect(char.restedExpMs).toBe(12 * HOUR);
    });

    /** 舊角色一上線就領滿額是最容易寫錯的一條 */
    it('lastSeenAt 缺值時不追溯發放', () => {
      const char = accrueRestedExp(makeChar(), NOW);
      expect(char.restedExpMs).toBe(0);
      expect(char.lastSeenAt).toBe(NOW);
    });

    it('時鐘回轉不產生負存量', () => {
      const char = accrueRestedExp(makeChar({ lastSeenAt: NOW + HOUR }), NOW);
      expect(char.restedExpMs).toBe(0);
    });
  });

  describe('消耗', () => {
    it('以實時扣減', () => {
      const char = drainRestedExp(makeChar({ restedExpMs: 10_000 }), 3_000, NOW);
      expect(char.restedExpMs).toBe(7_000);
      expect(char.lastSeenAt).toBe(NOW);
    });

    it('扣到 0 為止，不會變負', () => {
      const char = drainRestedExp(makeChar({ restedExpMs: 1_000 }), 5_000, NOW);
      expect(char.restedExpMs).toBe(0);
    });

    it('存量為 0 時仍推進 lastSeenAt', () => {
      const char = drainRestedExp(makeChar({ restedExpMs: 0, lastSeenAt: NOW - HOUR }), 1_000, NOW);
      expect(char.lastSeenAt).toBe(NOW);
      expect(char.restedExpMs ?? 0).toBe(0);
    });
  });

  describe('UI 倒數（`24-buff-debuff.md` § 24.8.6）', () => {
    it('以距上次落帳的時間補間，不等 10 秒才跳一格', () => {
      const char = makeChar({ restedExpMs: 60_000, lastSeenAt: NOW - 4_000 });
      expect(getRestedExpRemaining(char, NOW)).toBe(56_000);
    });

    it('補間不會低於 0', () => {
      const char = makeChar({ restedExpMs: 1_000, lastSeenAt: NOW - 90_000 });
      expect(getRestedExpRemaining(char, NOW)).toBe(0);
    });

    it('存量為 0 時回 0', () => {
      expect(getRestedExpRemaining(makeChar(), NOW)).toBe(0);
    });
  });

  describe('倍率', () => {
    it('存量 > 0 時為 x2', () => {
      const char = makeChar({ restedExpMs: 1 });
      expect(isRestedExpActive(char)).toBe(true);
      expect(getRestedExpMultiplier(char)).toBe(2);
    });

    it('存量歸零後回到 x1', () => {
      const char = makeChar({ restedExpMs: 0 });
      expect(isRestedExpActive(char)).toBe(false);
      expect(getRestedExpMultiplier(char)).toBe(1);
    });

    it('欄位缺值（舊角色）視為 x1', () => {
      expect(getRestedExpMultiplier(makeChar())).toBe(1);
    });
  });
});
