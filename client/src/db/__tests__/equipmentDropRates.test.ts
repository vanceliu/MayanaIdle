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
  5: [0.1, 1],
  6: [0.25, 0.5],
};

/** Boss 各階掉落值（/1000） */
const BOSS_VALUE: Record<number, number> = { 4: 3, 5: 3, 6: 1, 7: 0.1 };

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

  it('遠古地監 1~9F 每層都掉 T6', () => {
    for (let floor = 1; floor <= 9; floor++) {
      const area = `ancient-dungeon-${floor}f`;
      const t6 = equipmentEntries.filter(d => d.area === area && d.tier === 6);
      expect(t6, area).toHaveLength(1);
    }
  });
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
