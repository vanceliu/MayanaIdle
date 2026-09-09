import { describe, it, expect } from 'vitest';
import {
  settleGoldDrop,
  settleQuestGold,
  settleKillExp,
  getSpawnInterval,
  getBossSpawnChance,
  scaleMonsterStat,
  GOLD_DROP_CAP,
} from '../globalRates';

describe('全域倍率作用點（19 § 19.9）', () => {
  describe('settleGoldDrop（27 § 27.1）', () => {
    it('倍率 1.0 時抽值照原樣入帳', () => {
      expect(settleGoldDrop(120, 1, 1)).toBe(120);
    });

    it('上限 500 與抽值同乘全域倍率', () => {
      expect(settleGoldDrop(500, 1, 2)).toBe(1000);
      expect(settleGoldDrop(800, 1, 2)).toBe(GOLD_DROP_CAP * 2);
    });

    it('詞綴加成在上限之後乘', () => {
      expect(settleGoldDrop(500, 1.5, 1)).toBe(750);
    });

    it('結果向下取整', () => {
      expect(settleGoldDrop(7, 1, 1.5)).toBe(10);
    });
  });

  describe('settleQuestGold（36 § 36.3）', () => {
    it('任務金幣與掉落共用同一個全域倍率', () => {
      expect(settleQuestGold(300, 1)).toBe(300);
      expect(settleQuestGold(300, 2.5)).toBe(750);
      expect(settleQuestGold(7, 1.5)).toBe(10);
    });
  });

  describe('settleKillExp（28 § 28.1、04 § 4.11）', () => {
    it('基礎 ×3', () => {
      expect(settleKillExp(40, 1, 1)).toBe(120);
    });

    it('回鍋 ×2 與全域倍率相乘，不另設倍率', () => {
      expect(settleKillExp(40, 2, 1)).toBe(240);
      expect(settleKillExp(40, 2, 1.5)).toBe(360);
    });

    it('結果向下取整', () => {
      expect(settleKillExp(1, 1, 0.5)).toBe(1);
      expect(settleKillExp(1, 1, 0.3)).toBe(0);
    });
  });

  describe('getSpawnInterval（26 § 26.2）', () => {
    it('倍率 1.0 時只受 Pressure 影響', () => {
      expect(getSpawnInterval(1000, 0)).toBe(1000);
      expect(getSpawnInterval(1000, 0, 1)).toBe(1000);
      expect(getSpawnInterval(1000, 5, 1)).toBe(500);
    });

    it('全域生成倍率只縮放判定間隔', () => {
      expect(getSpawnInterval(1000, 0, 2)).toBe(500);
      expect(getSpawnInterval(1000, 5, 2)).toBe(250);
      expect(getSpawnInterval(1000, 0, 0.5)).toBe(2000);
    });
  });

  describe('getBossSpawnChance（26 § 26.4）', () => {
    it('基礎 10%', () => {
      expect(getBossSpawnChance(1)).toBeCloseTo(0.1);
    });

    it('倍率放大，上限 100%', () => {
      expect(getBossSpawnChance(3)).toBeCloseTo(0.3);
      expect(getBossSpawnChance(20)).toBe(1);
    });

    it('倍率 0 = 不生成 Boss', () => {
      expect(getBossSpawnChance(0)).toBe(0);
    });
  });

  describe('scaleMonsterStat（28 § 28.1）', () => {
    it('四捨五入且最小為 1', () => {
      expect(scaleMonsterStat(120, 1)).toBe(120);
      expect(scaleMonsterStat(120, 1.5)).toBe(180);
      expect(scaleMonsterStat(7, 0.5)).toBe(4);
      expect(scaleMonsterStat(1, 0.1)).toBe(1);
    });
  });
});
