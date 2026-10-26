import { describe, it, expect } from 'vitest';
import { MONSTER_SEEDS } from '../seed';
import type { MonsterTemplate } from '../../models/monster';

/** 怪物攻擊力曲線（`28-monster-stats.md` § 28.1） */
const all = MONSTER_SEEDS as MonsterTemplate[];
const bosses = all.filter(m => m.isBoss);
const normals = all.filter(m => !m.isBoss);
const TOP_AREA = 'hundred-pillar-91-100f';

/** Lv.31~60 一般怪該級典型攻擊上限 */
const curve = (level: number) => 36 * Math.pow(150 / 36, (level - 30) / 30);

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

describe('怪物攻擊力曲線', () => {
  it('百柱死神 Lv.80、攻擊 250~300，是全服攻擊力最高的怪物', () => {
    const reaper = bosses.find(b => b.name === '百柱死神')!;
    expect(reaper.level).toBe(80);
    expect(reaper.attackMin).toBe(250);
    expect(reaper.attackMax).toBe(300);
    const strongest = all.reduce((top, m) => (m.attackMax > top.attackMax ? m : top));
    expect(strongest.name).toBe('百柱死神');
  });

  it('百柱塔 91~100F 一般怪全為 Lv.80，最強的死之執行者上限 200', () => {
    const top = normals.filter(m => m.area === TOP_AREA);
    expect(top.length).toBeGreaterThan(0);
    for (const m of top) expect(m.level, m.name).toBe(80);
    const strongest = normals.reduce((a, m) => (m.attackMax > a.attackMax ? m : a));
    expect(strongest.name).toBe('死之執行者');
    expect(strongest.attackMax).toBe(200);
  });

  it('Lv.31~60 一般怪每級攻擊上限中位數貼齊曲線（±1）', () => {
    for (let level = 31; level <= 60; level++) {
      const peers = normals.filter(m => m.level === level);
      if (peers.length === 0) continue;
      expect(Math.abs(median(peers.map(p => p.attackMax)) - curve(level)), `Lv.${level}`)
        .toBeLessThanOrEqual(1);
    }
  });

  it('Lv.31~57 每級最強的 Boss 上限 = 曲線 × 1.3', () => {
    for (let level = 31; level <= 57; level++) {
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
