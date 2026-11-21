/**
 * 星盤篩選的比對規則（`models/starFilter.ts`）。
 */
import { describe, it, expect } from 'vitest';
import { STAR_NODE_BY_ID, STAR_NODES } from '../starChart';
import { starFilterTerms, starNodeMatches } from '../starFilter';

const node = (id: string) => STAR_NODE_BY_ID.get(id)!;
const matchIds = (q: string) => STAR_NODES.filter(n => starNodeMatches(n, starFilterTerms(q))).map(n => n.id);

describe('starNodeMatches', () => {
  it('不分大小寫比對效果名稱', () => {
    expect(starNodeMatches(node('elf-r300'), starFilterTerms('hp'))).toBe(true);
    expect(starNodeMatches(node('elf-r300'), starFilterTerms('HP'))).toBe(true);
    expect(starNodeMatches(node('knight-r360'), starFilterTerms('hp'))).toBe(false);
  });

  it('命星的代價與規則文字也比對', () => {
    expect(starNodeMatches(node('thief-keystone'), starFilterTerms('hp'))).toBe(true);
    expect(starNodeMatches(node('center-0-k'), starFilterTerms('耗魔'))).toBe(true);
  });

  it('節點類型與職業名可搜尋', () => {
    expect(matchIds('命星').every(id => node(id).kind === 'keystone')).toBe(true);
    expect(matchIds('命星')).toHaveLength(STAR_NODES.filter(n => n.kind === 'keystone').length);
    expect(starNodeMatches(node('priest-start'), starFilterTerms('牧師'))).toBe(true);
  });

  it('空白分隔的關鍵字全部符合才算', () => {
    const ids = matchIds('命星 hp');
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(id => node(id).kind === 'keystone')).toBe(true);
    expect(ids).not.toContain('knight-keystone');
  });

  it('空字串沒有關鍵字', () => {
    expect(starFilterTerms('   ')).toEqual([]);
  });
});
