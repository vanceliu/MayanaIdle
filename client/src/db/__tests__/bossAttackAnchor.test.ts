import { describe, it, expect } from 'vitest';
import { MONSTER_SEEDS } from '../seed';
import type { MonsterTemplate } from '../../models/monster';

/** 怪物攻擊力曲線（`28-monster-stats.md` § 28.1） */
const all = MONSTER_SEEDS as MonsterTemplate[];
const bosses = all.filter(m => m.isBoss);
const normals = all.filter(m => !m.isBoss);
const TOP_AREA = 'hundred-pillar-91-100f';

/** Lv.31~70 一般怪該級典型攻擊上限 */
const curve = (level: number) =>
  level <= 60 ? 36 * Math.pow(150 / 36, (level - 30) / 30) : 150 + 2.5 * (level - 60);

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

describe('怪物攻擊力曲線', () => {
  it('百柱死神 Lv.80、攻擊 200~250，是全服攻擊力最高的怪物', () => {
    const reaper = bosses.find(b => b.name === '百柱死神')!;
    expect(reaper.level).toBe(80);
    expect(reaper.attackMin).toBe(200);
    expect(reaper.attackMax).toBe(250);
    const strongest = all.reduce((top, m) => (m.attackMax > top.attackMax ? m : top));
    expect(strongest.name).toBe('百柱死神');
  });

  it('Lv.70 Boss 攻擊 = 改動前 × 250/300', () => {
    const expected: Record<string, [number, number]> = {
      守護者之主: [203, 242],
      霜凍伊莉絲: [194, 232],
      熔岩伊弗利特: [194, 232],
    };
    const lv70 = bosses.filter(b => b.level === 70);
    expect(lv70.map(b => b.name).sort()).toEqual(Object.keys(expected).sort());
    for (const b of lv70) expect([b.attackMin, b.attackMax], b.name).toEqual(expected[b.name]);
  });

  it('百柱塔 91~100F 一般怪全為 Lv.70，最強的死之執行者上限 184', () => {
    const top = normals.filter(m => m.area === TOP_AREA);
    expect(top.length).toBeGreaterThan(0);
    for (const m of top) expect(m.level, m.name).toBe(70);
    const strongest = normals.reduce((a, m) => (m.attackMax > a.attackMax ? m : a));
    expect(strongest.name).toBe('死之執行者');
    expect(strongest.attackMax).toBe(184);
  });

  it('Lv.31~70 一般怪每級攻擊上限中位數貼齊曲線（±2）', () => {
    for (let level = 31; level <= 70; level++) {
      const peers = normals.filter(m => m.level === level);
      if (peers.length === 0) continue;
      expect(Math.abs(median(peers.map(p => p.attackMax)) - curve(level)), `Lv.${level}`)
        .toBeLessThanOrEqual(2);
    }
  });

  it('Lv.31~65 每級最強的 Boss 上限 = 曲線 × 1.3', () => {
    for (let level = 31; level <= 65; level++) {
      const peers = bosses.filter(b => b.level === level);
      if (peers.length === 0) continue;
      expect(Math.max(...peers.map(b => b.attackMax)), `Lv.${level}`)
        .toBe(Math.round(curve(level) * 1.3));
    }
  });

  it('等級越高的 Boss 攻擊力不低於低等的（曲線不可倒掛）', () => {
    const sorted = [...bosses].sort((a, b) => a.level - b.level);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].attackMax, `${sorted[i].name} 不應低於 ${sorted[i - 1].name}`)
        .toBeGreaterThanOrEqual(sorted[i - 1].attackMax);
    }
  });

  it('同級的 Boss 一定比一般怪痛', () => {
    for (const boss of bosses) {
      const peers = normals.filter(m => m.level === boss.level);
      if (peers.length === 0) continue;
      const peerMax = Math.max(...peers.map(p => p.attackMax));
      expect(boss.attackMax, `${boss.name} 不應弱於同級一般怪`).toBeGreaterThan(peerMax);
    }
  });

  it('每隻怪的攻擊下限都小於上限', () => {
    for (const m of all) {
      expect(m.attackMin, m.name).toBeLessThan(m.attackMax);
    }
  });
});
