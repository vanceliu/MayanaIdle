import { describe, it, expect } from 'vitest';
import { MONSTER_SEEDS } from '../seed';
import { DAMAGE_REDUCTION_CAP } from '../../systems/combat';
import type { MonsterTemplate } from '../../models/monster';

/**
 * Boss 攻擊力的錨點（`28-monster-stats.md` § 28.1）。
 *
 * 全服最強的百柱死神在角色吃滿減傷上限時，單次傷害必須落在 50~60 ——
 * 整條 Boss 攻擊曲線是由這個數字回推的，改了它就等於改掉整個後期的承壓設計。
 */
const bosses = (MONSTER_SEEDS as MonsterTemplate[]).filter(m => m.isBoss);

/** 傷害計算與 `combat.ts` 同式：1 防禦＝1% 減傷，上限 75% */
function damageAtCap(attack: number): number {
  return Math.max(1, Math.floor(attack * (100 - DAMAGE_REDUCTION_CAP) / 100));
}

describe('Boss 攻擊力錨點', () => {
  it('百柱死神在 75% 減傷下是 50~60', () => {
    const reaper = bosses.find(b => b.name === '百柱死神')!;
    expect(damageAtCap(reaper.attackMin)).toBe(50);
    expect(damageAtCap(reaper.attackMax)).toBe(60);
  });

  it('百柱死神是全服攻擊力最高的怪物 —— 錨點必須真的在頂端', () => {
    const strongest = (MONSTER_SEEDS as MonsterTemplate[])
      .reduce((top, m) => (m.attackMax > top.attackMax ? m : top));
    expect(strongest.name).toBe('百柱死神');
  });

  it('等級越高的 Boss 攻擊力不低於低等的（曲線不可倒掛）', () => {
    const sorted = [...bosses].sort((a, b) => a.level - b.level);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].attackMax, `${sorted[i].name} 不應低於 ${sorted[i - 1].name}`)
        .toBeGreaterThanOrEqual(sorted[i - 1].attackMax);
    }
  });

  /**
   * 前期不可能吃到 75% 減傷，所以低等 Boss 的攻擊力必須明顯低於錨點 ——
   * 照同一個倍率等比放大就是這裡會擋下來的錯誤。
   */
  it('低等 Boss 的傷害佔角色 HP 的比例與錨點相當（不會秒殺）', () => {
    // 各級距實際拿得到的減傷（§ 28.1 錨點表）
    const reduction: Record<number, number> = { 30: 25, 35: 30, 45: 40, 50: 50, 52: 55, 57: 65, 60: 75 };
    // 角色 HP：起始 30，每級 +(VIT-6 ~ VIT-3)，以 VIT 16 不加點的保守值估
    const hpAt = (level: number) => 30 + (level - 1) * 11.5;

    for (const boss of bosses) {
      const rate = reduction[boss.level];
      expect(rate, `${boss.name} Lv.${boss.level} 沒有對應的減傷假設`).toBeDefined();
      const share = (boss.attackMax * (1 - rate / 100)) / hpAt(boss.level);
      expect(share, `${boss.name} 單次傷害佔 HP ${(share * 100).toFixed(1)}%`).toBeLessThan(0.11);
    }
  });

  /**
   * 一般怪是持續挨打的，後期不可以跟著 Boss 的錨點一起被拉上去 ——
   * 那會讓雜魚打得跟終王一樣痛（§ 28.1 一般怪物的攻擊力）。
   */
  it('Lv.57~60 的一般怪單次傷害壓在角色 HP 的 3% 附近', () => {
    const hpAt = (level: number) => 30 + (level - 1) * 11.5;
    const reduction: Record<number, number> = { 57: 65, 58: 68, 59: 71, 60: 75 };

    const late = (MONSTER_SEEDS as MonsterTemplate[]).filter(m => !m.isBoss && m.level >= 57);
    expect(late.length).toBeGreaterThan(0);

    for (const m of late) {
      const mid = (m.attackMin + m.attackMax) / 2;
      const share = (mid * (1 - reduction[m.level] / 100)) / hpAt(m.level);
      expect(share, `${m.name} Lv.${m.level} 佔 ${(share * 100).toFixed(1)}%`).toBeLessThan(0.04);
    }
  });

  it('同級的 Boss 一定比一般怪痛', () => {
    const all = MONSTER_SEEDS as MonsterTemplate[];
    for (const boss of bosses) {
      const peers = all.filter(m => !m.isBoss && m.level === boss.level);
      if (peers.length === 0) continue;
      const peerMax = Math.max(...peers.map(p => p.attackMax));
      expect(boss.attackMax, `${boss.name} 不應弱於同級一般怪`).toBeGreaterThan(peerMax);
    }
  });

  it('每隻 Boss 的攻擊下限都小於上限', () => {
    for (const b of bosses) {
      expect(b.attackMin, b.name).toBeLessThan(b.attackMax);
    }
  });
});
