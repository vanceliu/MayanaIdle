import { describe, it, expect } from 'vitest';
import { buildPool } from '../TalentFusion';
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';
import type { TalentAffixInstance } from '../../models/talent';

/**
 * 合成清單的分區與排序（`51-auto-talent.md` § 51.10）。
 *
 * 分區依據就是合成的必要條件：同種類、同階級。跨分區一定合不起來，
 * 清單照著這條分，玩家不必逐列比對。
 */

const defOf = (kind: 'condition' | 'action', tier: number) =>
  TALENT_AFFIX_DEFS.find(d => d.kind === kind && d.tier === tier && !d.blocked)!;

let nextId = 1;
function inst(definitionId: number, boundParam: string | null = null): TalentAffixInstance {
  return { id: nextId++, characterId: 1, definitionId, boundParam, slotId: null } as TalentAffixInstance;
}

describe('合成清單分區', () => {
  it('條件與實作分在不同區', () => {
    const pool = buildPool([inst(defOf('condition', 1).id), inst(defOf('action', 1).id)]);
    expect(pool).toHaveLength(2);
    expect(pool.map(s => s.title)).toEqual(['條件 T1', '實作 T1']);
  });

  it('同種類不同階級也分區', () => {
    const pool = buildPool([inst(defOf('condition', 1).id), inst(defOf('condition', 2).id)]);
    expect(pool.map(s => s.title)).toEqual(['條件 T1', '條件 T2']);
  });

  it('條件排在實作之前，階級由低到高', () => {
    const pool = buildPool([
      inst(defOf('action', 2).id),
      inst(defOf('condition', 2).id),
      inst(defOf('action', 1).id),
      inst(defOf('condition', 1).id),
    ]);
    expect(pool.map(s => s.title)).toEqual(['條件 T1', '條件 T2', '實作 T1', '實作 T2']);
  });

  it('同一種鑲材疊成一列，不逐個實例列出', () => {
    const def = defOf('condition', 1);
    const pool = buildPool([inst(def.id), inst(def.id), inst(def.id)]);
    expect(pool[0].groups).toHaveLength(1);
    expect(pool[0].groups[0].ids).toHaveLength(3);
  });

  it('綁定不同的同一定義各自成列', () => {
    const def = defOf('action', 2);
    const pool = buildPool([inst(def.id, 'fire'), inst(def.id, 'ice'), inst(def.id, 'fire')]);
    expect(pool[0].groups).toHaveLength(2);
    expect(pool[0].groups.map(g => g.ids.length).sort()).toEqual([1, 2]);
  });

  it('查不到定義的實例不進清單', () => {
    expect(buildPool([inst(-1)])).toEqual([]);
  });
});
