import { describe, it, expect } from 'vitest';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../seed';
import { resolveArea } from '../../models/mapData';

/**
 * 裝備掉率（`06-equipment-acquire.md` § 6A.1、`27-drop-table.md` § 27.3）：
 * 一般怪同階內依區域中位等級線性內插，Boss 各階固定。
 */

/** 一般怪各階掉落值區間 [下限, 上限]（/1000） */
const NORMAL_BOUNDS: Record<number, [number, number]> = {
  2: [1, 10],
  3: [1, 10],
  4: [0.5, 5],
  5: [0.5, 5],
  6: [0.5, 1],
};

/** Boss 各階掉落值（/1000） */
const BOSS_VALUE: Record<number, number> = { 4: 10, 5: 10, 6: 5, 7: 0.1 };

const equipmentEntries = DROP_TABLE_SEEDS.filter(d => d.itemType === 'equipment' && d.equipmentPool);

function midLevel(area: string): number {
  const resolved = resolveArea(area);
  if (!resolved) throw new Error(`area 無法解析：${area}`);
  return (resolved.levelMin + resolved.levelMax) / 2;
}

function entriesOfTier(tier: number) {
  return equipmentEntries
    .filter(d => d.tier === tier)
    .map(d => ({ area: d.area, value: d.dropValue, mid: midLevel(d.area) }));
}

describe('一般怪裝備掉率依區域等級', () => {
  for (const tier of Object.keys(NORMAL_BOUNDS).map(Number)) {
    describe(`T${tier}`, () => {
      const rows = entriesOfTier(tier);
      const [low, high] = NORMAL_BOUNDS[tier];

      it('最淺區域取下限、最深區域取上限', () => {
        expect(Math.min(...rows.map(r => r.value))).toBe(low);
        expect(Math.max(...rows.map(r => r.value))).toBe(high);
      });

      it('掉落值符合中位等級線性內插（小數 2 位）', () => {
        const lo = Math.min(...rows.map(r => r.mid));
        const hi = Math.max(...rows.map(r => r.mid));
        for (const r of rows) {
          const expected = Math.round((low + (high - low) * (r.mid - lo) / (hi - lo)) * 100) / 100;
          expect(r.value, r.area).toBe(expected);
        }
      });

      it('中位等級相同掉率相同、較高不低於較低', () => {
        const sorted = [...rows].sort((a, b) => a.mid - b.mid);
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const cur = sorted[i];
          if (cur.mid === prev.mid) expect(cur.value, `${prev.area} vs ${cur.area}`).toBe(prev.value);
          else expect(cur.value, `${prev.area} vs ${cur.area}`).toBeGreaterThanOrEqual(prev.value);
        }
      });
    });
  }

});

/** 一般怪 T4~T6 掉落區域（`06-equipment-acquire.md` § 6A.1） */
const floors = (dungeon: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${dungeon}-${from + i}f`);

const NORMAL_TIER_AREAS: Record<number, string[]> = {
  4: [
    'snow-field', 'snow-field-deep', ...floors('ivory-tower', 1, 4),
    'demon-forest', 'rotleaf-path', 'demon-altar',
    'mirror-forest', 'glimmer-shore', 'shattered-mirror',
    'dragon-valley-outskirts', 'dragon-valley-surface',
  ],
  5: [
    ...floors('misty-cave', 1, 3), ...floors('underwater-prison', 1, 4), ...floors('dragon-valley', 1, 7),
    'ivory-tower-5f', 'ancient-battlefield', ...floors('ancient-dungeon', 1, 6),
    'hundred-pillar-1-10f', 'hundred-pillar-11-20f', 'hundred-pillar-21-30f',
    'hundred-pillar-31-40f', 'hundred-pillar-41-50f',
  ],
  6: [
    ...floors('ancient-dungeon', 7, 9),
    'hundred-pillar-51-60f', 'hundred-pillar-61-70f', 'hundred-pillar-71-80f',
    'hundred-pillar-81-90f', 'hundred-pillar-91-100f',
  ],
};

describe('一般怪 T4~T6 掉落區域', () => {
  for (const [tier, areas] of Object.entries(NORMAL_TIER_AREAS).map(([t, a]) => [Number(t), a] as const)) {
    it(`T${tier} 區域與 seed 一致`, () => {
      const actual = equipmentEntries.filter(d => d.tier === tier).map(d => d.area).sort();
      expect(actual).toEqual([...areas].sort());
    });
  }
});

/** 各 Boss 掉落的裝備階級（`27-drop-table.md` § 27.5） */
const BOSS_TIERS: Record<string, number[]> = {
  試煉飛龍: [4],
  雪地之主: [4],
  象牙塔惡魔: [4],
  朦朧蛇魔: [5],
  深海獄王: [5],
  安塔巨龍: [5],
  遠古騎士: [6, 7],
  毒之皇女: [5],
  哥布林之王: [5],
  暗影吸血鬼: [5],
  不死殭屍王: [5, 6],
  龍王約特勒: [5, 6],
  冥王哈馬斯: [6, 7],
  霜凍伊莉絲: [6, 7],
  熔岩伊弗利特: [6, 7],
  守護者之主: [6, 7],
  百柱死神: [6, 7],
};

describe('Boss 裝備階級', () => {
  const bossEquipment = BOSS_DROP_TABLE_SEEDS.filter(d => d.itemType === 'equipment');

  it('只有表列 Boss 掉裝備', () => {
    expect(new Set(bossEquipment.map(d => d.bossName))).toEqual(new Set(Object.keys(BOSS_TIERS)));
  });

  for (const [boss, tiers] of Object.entries(BOSS_TIERS)) {
    it(`${boss}：T${tiers.join('／T')}，每階武器與防具各一條`, () => {
      const rows = bossEquipment.filter(d => d.bossName === boss);
      for (const tier of tiers) {
        const pools = rows.filter(d => d.tier === tier).map(d => d.equipmentPool).sort();
        expect(pools, `T${tier}`).toEqual(['armor', 'weapon']);
      }
      expect(rows).toHaveLength(tiers.length * 2);
    });
  }
});

/** 強化卷軸掉落值（/1000）：普通卷軸與＋／－ 卷軸（`27-drop-table.md` § 27.1） */
const SCROLL_IDS = { basic: [7, 8], special: [157, 158, 159, 160] };
const SCROLL_NORMAL = { basic: 1, special: 0.2 };
const SCROLL_BOSS = { basic: 10, special: 2 };

describe('強化卷軸掉率', () => {
  for (const kind of ['basic', 'special'] as const) {
    it(`${kind === 'basic' ? '普通' : '＋／－'}卷軸：一般怪與 Boss 各為固定值`, () => {
      const ids = new Set(SCROLL_IDS[kind]);
      const normal = DROP_TABLE_SEEDS.filter(d => d.itemTemplateId != null && ids.has(d.itemTemplateId));
      const boss = BOSS_DROP_TABLE_SEEDS.filter(d => d.itemTemplateId != null && ids.has(d.itemTemplateId));
      expect(normal.length).toBeGreaterThan(0);
      expect(boss.length).toBeGreaterThan(0);
      for (const d of normal) expect(d.dropValue, `${d.area} #${d.itemTemplateId}`).toBe(SCROLL_NORMAL[kind]);
      for (const d of boss) expect(d.dropValue, `${d.bossName} #${d.itemTemplateId}`).toBe(SCROLL_BOSS[kind]);
    });
  }
});

describe('Boss 裝備掉率', () => {
  it('各階固定值，武器與防具相同', () => {
    const bossEquipment = BOSS_DROP_TABLE_SEEDS.filter(d => d.itemType === 'equipment');
    expect(bossEquipment.length).toBeGreaterThan(0);
    for (const d of bossEquipment) {
      expect(d.dropValue, `${d.bossName} T${d.tier} ${d.equipmentPool}`).toBe(BOSS_VALUE[d.tier!]);
    }
  });
});
