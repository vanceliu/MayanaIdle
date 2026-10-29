import { describe, it, expect } from 'vitest';
import { MONSTER_SEEDS } from '../seed';
import { getRegion } from '../../models/mapData';

/** 百柱塔各段等級（`09-dungeon.md` 百柱塔、`28-monster-stats.md` § 28.8） */
const SECTIONS: { floors: string[]; levelMin: number; levelMax: number }[] = [
  { floors: ['1-10', '11-20', '21-30'], levelMin: 50, levelMax: 56 },
  { floors: ['31-40', '41-50', '51-60'], levelMin: 56, levelMax: 63 },
  { floors: ['61-70', '71-80', '81-90'], levelMin: 63, levelMax: 70 },
  { floors: ['91-100'], levelMin: 70, levelMax: 80 },
];

describe('百柱塔怪物等級', () => {
  for (const { floors, levelMin, levelMax } of SECTIONS) {
    for (const floor of floors) {
      const area = `hundred-pillar-${floor}f`;
      it(`${floor}F：區域 Lv.${levelMin}~${levelMax}，怪物落在區間內，王為上限`, () => {
        const region = getRegion(area)!;
        expect([region.levelMin, region.levelMax]).toEqual([levelMin, levelMax]);
        const monsters = MONSTER_SEEDS.filter(m => m.area === area);
        expect(monsters.length).toBeGreaterThan(0);
        for (const m of monsters) {
          expect(m.level, m.name).toBeGreaterThanOrEqual(levelMin);
          expect(m.level, m.name).toBeLessThanOrEqual(levelMax);
        }
        for (const boss of monsters.filter(m => m.isBoss)) expect(boss.level, boss.name).toBe(levelMax);
      });
    }
  }

  it('怪物等級上限 70，只有百柱死神例外', () => {
    for (const m of MONSTER_SEEDS.filter(m => m.name !== '百柱死神')) {
      expect(m.level, m.name).toBeLessThanOrEqual(70);
    }
  });
});
