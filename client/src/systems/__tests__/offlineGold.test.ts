import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../testing/testDb';
import {
  addHuntGold,
  addHuntTime,
  isHunting,
  offlineGoldMailKey,
  settleOfflineGold,
  OFFLINE_GOLD_CAP_MS,
} from '../offlineGold';
import { listMail, sendOfflineGoldMail } from '../mailbox';
import type { Character } from '../../models/character';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const NOW = 1_700_000_000_000;
const CHAR = 1;

function makeChar(over: Partial<Character> = {}): Character {
  return {
    id: CHAR, userId: 1, name: 'T', className: 'knight', level: 1, exp: 0, expToNext: 100,
    hp: 30, mp: 10,
    baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0,
    currentArea: 'a', currentZone: 'z', currentRegion: 'r', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: NOW, createdAt: NOW,
    ...over,
  };
}

/** 狩獵速率 1 金幣／秒 */
const HUNTED = { huntGold: 3600, huntMs: HOUR };

describe('離線金幣（`04-character.md` § 4.12）', () => {
  describe('狩獵判定', () => {
    it('只有野外、副本且搜尋模式為自動才算', () => {
      expect(isHunting('field', 'auto')).toBe(true);
      expect(isHunting('dungeon', 'auto')).toBe(true);
      expect(isHunting('field', 'manual')).toBe(false);
      expect(isHunting('town', 'auto')).toBe(false);
      expect(isHunting('training', 'auto')).toBe(false);
      expect(isHunting('arena', 'auto')).toBe(false);
      expect(isHunting(undefined, 'auto')).toBe(false);
    });

    it('累計時長與金幣，舊角色缺值從 0 起算', () => {
      const char = addHuntGold(addHuntTime(makeChar(), 5000), 120);
      expect(char.huntMs).toBe(5000);
      expect(char.huntGold).toBe(120);
    });

    it('0 不產生新物件', () => {
      const char = makeChar();
      expect(addHuntTime(char, 0)).toBe(char);
      expect(addHuntGold(char, 0)).toBe(char);
    });
  });

  describe('結算', () => {
    it('狩獵速率 × 離線時長 × 0.5', () => {
      const { mail, char } = settleOfflineGold(makeChar({ ...HUNTED, lastSeenAt: NOW - 2 * HOUR }), NOW);
      expect(mail?.items).toEqual([{ type: 'gold', amount: 3600 }]);
      expect(mail?.sourceKey).toBe(offlineGoldMailKey(NOW - 2 * HOUR));
      expect(mail?.title).toBe('離線收益（離線 2 小時 0 分）');
      expect(char.huntGold).toBe(0);
      expect(char.huntMs).toBe(0);
    });

    it('離線時長上限 24 小時，超出捨棄', () => {
      const { mail } = settleOfflineGold(makeChar({ ...HUNTED, lastSeenAt: NOW - 100 * HOUR }), NOW);
      expect(mail?.items[0].amount).toBe(Math.floor(OFFLINE_GOLD_CAP_MS / 1000 * 0.5));
      expect(mail?.title).toBe('離線收益（離線 24 小時 0 分）');
    });

    it('金額取 floor', () => {
      const { mail } = settleOfflineGold(makeChar({ huntGold: 1, huntMs: 3 * MINUTE, lastSeenAt: NOW - 10 * MINUTE }), NOW);
      expect(mail?.items[0].amount).toBe(1);
    });

    it('離線未滿 10 分鐘不結算，狩獵累計保留', () => {
      const before = makeChar({ ...HUNTED, lastSeenAt: NOW - 10 * MINUTE + 1 });
      const { mail, char } = settleOfflineGold(before, NOW);
      expect(mail).toBeNull();
      expect(char).toBe(before);
    });

    it('狩獵時長為 0 不寄信，累計歸零', () => {
      const { mail, char } = settleOfflineGold(makeChar({ huntGold: 0, huntMs: 0, lastSeenAt: NOW - 5 * HOUR }), NOW);
      expect(mail).toBeNull();
      expect(char.huntMs).toBe(0);
    });

    it('lastSeenAt 缺值的舊角色不結算', () => {
      const before = makeChar({ ...HUNTED });
      expect(settleOfflineGold(before, NOW)).toEqual({ char: before, mail: null });
    });

    it('不動 lastSeenAt（由回鍋加倍更新）', () => {
      const { char } = settleOfflineGold(makeChar({ ...HUNTED, lastSeenAt: NOW - HOUR }), NOW);
      expect(char.lastSeenAt).toBe(NOW - HOUR);
    });
  });

  describe('寄信', () => {
    beforeEach(async () => {
      await db.mailbox.clear();
      await db.characters.clear();
      await db.characters.add({ id: CHAR, createdAt: 1000, ...HUNTED, lastSeenAt: NOW - 2 * HOUR } as never);
    });

    it('寄信並同時寫入結算基準', async () => {
      const { mail } = settleOfflineGold(makeChar({ ...HUNTED, lastSeenAt: NOW - 2 * HOUR }), NOW);
      const sent = await sendOfflineGoldMail(mail!, { lastSeenAt: NOW, restedExpMs: 0, huntGold: 0, huntMs: 0 });
      expect(sent).toBe(true);

      const mails = await listMail(CHAR);
      expect(mails).toHaveLength(1);
      expect(mails[0].items).toEqual([{ type: 'gold', amount: 3600 }]);
      expect(mails[0].claimedAt).toBeNull();

      const stored = await db.characters.get(CHAR);
      expect(stored?.lastSeenAt).toBe(NOW);
      expect(stored?.huntGold).toBe(0);
      expect(stored?.huntMs).toBe(0);
    });

    it('同一個 sourceKey 不重寄', async () => {
      const { mail } = settleOfflineGold(makeChar({ ...HUNTED, lastSeenAt: NOW - 2 * HOUR }), NOW);
      const baseline = { lastSeenAt: NOW, restedExpMs: 0, huntGold: 0, huntMs: 0 };
      await sendOfflineGoldMail(mail!, baseline);
      expect(await sendOfflineGoldMail(mail!, baseline)).toBe(false);
      expect(await listMail(CHAR)).toHaveLength(1);
    });
  });
});
