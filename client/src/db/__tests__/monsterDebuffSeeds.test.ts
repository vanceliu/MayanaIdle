import { describe, it, expect } from 'vitest';
import { MONSTER_SEEDS } from '../seed/monsterSeeds';
import { PLAYER_DEBUFF_TYPES } from '../../models/playerDebuff';

/**
 * 驗證 seed 的 debuff 資料符合
 * docs/design/25-monster-system.md § 25.8 / § 25.9
 */

/** § 25.9.1 巨獸類定義：名稱含「巨人」「巨獸」「凶獸」的大型力量型怪物 */
function isBehemoth(name: string): boolean {
  return name.includes('巨人') || name.includes('巨獸') || name.includes('凶獸');
}

/** 殘影系列為 Boss 殘影，暈眩能力視同其本體 Boss */
function isEcho(name: string): boolean {
  return name.startsWith('殘影');
}

describe('怪物 debuff seed 資料', () => {
  it('所有 debuff 類型皆為已定義的角色 debuff', () => {
    for (const m of MONSTER_SEEDS) {
      for (const d of m.debuffs ?? []) {
        expect(PLAYER_DEBUFF_TYPES).toContain(d.type);
      }
    }
  });

  it('觸發率介於 10%~22%', () => {
    for (const m of MONSTER_SEEDS) {
      for (const d of m.debuffs ?? []) {
        expect(d.chance, `${m.name} / ${d.type}`).toBeGreaterThanOrEqual(10);
        expect(d.chance, `${m.name} / ${d.type}`).toBeLessThanOrEqual(22);
      }
    }
  });

  it('單一怪物不重複同類型 debuff', () => {
    for (const m of MONSTER_SEEDS) {
      const types = (m.debuffs ?? []).map(d => d.type);
      expect(new Set(types).size, m.name).toBe(types.length);
    }
  });

  it('同名怪物跨區域的 debuff 能力一致（不為同一怪物設計多個獨立模板）', () => {
    const byName = new Map<string, string>();
    for (const m of MONSTER_SEEDS) {
      const signature = JSON.stringify(m.debuffs ?? []);
      const existing = byName.get(m.name);
      if (existing === undefined) byName.set(m.name, signature);
      else expect(signature, m.name).toBe(existing);
    }
  });

  it('§ 25.9.2 規則 5：暈眩僅 Boss、殘影系列、巨獸類可施加', () => {
    const offenders = MONSTER_SEEDS
      .filter(m => (m.debuffs ?? []).some(d => d.type === 'stun'))
      .filter(m => !m.isBoss && !isEcho(m.name) && !isBehemoth(m.name))
      .map(m => m.name);
    expect(offenders).toEqual([]);
  });

  it('非 Boss 巨獸類暈眩觸發率固定 10%', () => {
    const behemothStuns = MONSTER_SEEDS
      .filter(m => !m.isBoss && !isEcho(m.name) && isBehemoth(m.name))
      .flatMap(m => (m.debuffs ?? []).filter(d => d.type === 'stun').map(d => ({ name: m.name, chance: d.chance })));

    expect(behemothStuns.length).toBeGreaterThan(0);
    for (const s of behemothStuns) {
      expect(s.chance, s.name).toBe(10);
    }
  });

  it('Boss 暈眩觸發率介於 15%~22%', () => {
    const bossStuns = MONSTER_SEEDS
      .filter(m => m.isBoss)
      .flatMap(m => (m.debuffs ?? []).filter(d => d.type === 'stun').map(d => ({ name: m.name, chance: d.chance })));

    expect(bossStuns.length).toBeGreaterThan(0);
    for (const s of bossStuns) {
      expect(s.chance, s.name).toBeGreaterThanOrEqual(15);
      expect(s.chance, s.name).toBeLessThanOrEqual(22);
    }
  });

  it('部分怪物依 § 25.8 表格帶有正確的 debuff', () => {
    const find = (name: string) => MONSTER_SEEDS.find(m => m.name === name);
    expect(find('暴牙兔')?.debuffs).toEqual([{ type: 'bleed', chance: 15 }]);
    expect(find('毒蛇')?.debuffs).toEqual([{ type: 'poison', chance: 20 }]);
    expect(find('冰霜蜘蛛')?.debuffs).toEqual([{ type: 'poison', chance: 12 }]);
    expect(find('熔岩巨獸')?.debuffs).toEqual([{ type: 'stun', chance: 10 }]);
    expect(find('百柱死神')?.debuffs).toEqual([
      { type: 'curse', chance: 22 },
      { type: 'weaken', chance: 22 },
      { type: 'stun', chance: 22 },
    ]);
  });

  it('野牛、史萊姆等無 debuff 能力的怪物不帶 debuffs 欄位', () => {
    expect(MONSTER_SEEDS.find(m => m.name === '野牛')?.debuffs).toBeUndefined();
    expect(MONSTER_SEEDS.find(m => m.name === '史萊姆')?.debuffs).toBeUndefined();
  });

  it('原先缺漏於 § 25.8 的 6 隻怪物已補齊 debuff 能力', () => {
    const find = (name: string) => MONSTER_SEEDS.find(m => m.name === name);
    expect(find('高地狼人')?.debuffs).toEqual([{ type: 'bleed', chance: 18 }]);
    expect(find('風蝎')?.debuffs).toEqual([{ type: 'poison', chance: 18 }]);
    expect(find('暴風鷹')?.debuffs).toEqual([{ type: 'bleed', chance: 18 }]);
    expect(find('山賊頭目')?.debuffs).toEqual([{ type: 'bleed', chance: 15 }]);
    expect(find('試煉飛龍')?.debuffs).toEqual([
      { type: 'bleed', chance: 15 },
      { type: 'stun', chance: 15 },
    ]);
    expect(find('雪地之主')?.debuffs).toEqual([{ type: 'stun', chance: 15 }]);
  });

  it('§ 25.9.1：每個區域最多只有一種減速怪', () => {
    const byArea = new Map<string, string[]>();
    for (const m of MONSTER_SEEDS) {
      if (!(m.debuffs ?? []).some(d => d.type === 'slow')) continue;
      byArea.set(m.area, [...(byArea.get(m.area) ?? []), m.name]);
    }
    const violations = [...byArea.entries()].filter(([, names]) => names.length > 1);
    expect(violations).toEqual([]);
  });

  it('§ 25.9.1：減速觸發率固定 10%', () => {
    const slowRates = MONSTER_SEEDS
      .flatMap(m => (m.debuffs ?? []).filter(d => d.type === 'slow').map(d => ({ name: m.name, chance: d.chance })));

    expect(slowRates.length).toBeGreaterThan(0);
    for (const s of slowRates) {
      expect(s.chance, s.name).toBe(10);
    }
  });

  it('每隻 Boss 都具備 debuff 能力', () => {
    const bossesWithoutDebuff = MONSTER_SEEDS
      .filter(m => m.isBoss && (m.debuffs ?? []).length === 0)
      .map(m => m.name);
    expect(bossesWithoutDebuff).toEqual([]);
  });
});
