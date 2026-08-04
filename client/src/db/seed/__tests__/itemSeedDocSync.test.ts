import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ITEM_DEFINITIONS } from '../itemSeeds';

/**
 * `30-items.md` 與 `itemSeeds.ts` 的防漂移測試。
 *
 * 兩邊曾整表對不上（賣價全數 2 倍、新手區達 7 倍），玩家看文件規劃刷素材路線會全錯。
 * seed 是實際運作值，文件必須跟著 seed 走。
 */

const DOC = readFileSync(
  resolve(__dirname, '../../../../../docs/design/30-items.md'),
  'utf-8',
);

const MATERIALS = ITEM_DEFINITIONS.filter(i => i.category === 'material');

describe('30-items.md ↔ itemSeeds.ts 賣價與重量', () => {
  /** 解析「| 道具名 | 重量 | 賣價G | ...」型式的資料列 */
  const docRows = new Map<string, { weight: number; sellPrice: number }>();
  for (const line of DOC.split('\n')) {
    const m = /^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([\d,]+)G\s*\|/.exec(line);
    if (!m) continue;
    docRows.set(m[1], {
      weight: Number(m[2]),
      sellPrice: Number(m[3].replace(/,/g, '')),
    });
  }

  it('文件有解析到素材資料列', () => {
    expect(docRows.size).toBeGreaterThan(50);
  });

  it('文件列出的賣價與 seed 的 sellPrice 一致', () => {
    const mismatched: string[] = [];
    for (const [name, row] of docRows) {
      const def = ITEM_DEFINITIONS.find(i => i.name === name);
      if (!def?.sellPrice) continue;
      if (def.sellPrice !== row.sellPrice) {
        mismatched.push(`${name}: 文件 ${row.sellPrice}G / seed ${def.sellPrice}G`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it('文件列出的重量與 seed 的 weight 一致', () => {
    const mismatched: string[] = [];
    for (const [name, row] of docRows) {
      const def = ITEM_DEFINITIONS.find(i => i.name === name);
      if (!def) continue;
      if (def.weight !== row.weight) {
        mismatched.push(`${name}: 文件 ${row.weight} / seed ${def.weight}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});

describe('30-items.md 素材 iconTier 對照表 ↔ seed', () => {
  /** 解析「| N | 顏色｜定位 | 素材A、素材B |」 */
  const docTier = new Map<string, number>();
  const section = DOC.split('#### 素材 iconTier 對照')[1] ?? '';
  for (const line of section.split('#### ')[0].split('\n')) {
    const m = /^\|\s*([1-7])\s*\|\s*[^|]+\|\s*([^|]+?)\s*\|/.exec(line);
    if (!m) continue;
    for (const name of m[2].split('、')) docTier.set(name.trim(), Number(m[1]));
  }

  it('對照表涵蓋 seed 中每一個有 iconTier 的素材，且值相同', () => {
    const problems: string[] = [];
    for (const def of MATERIALS) {
      if (def.iconTier === undefined) continue;
      const documented = docTier.get(def.name);
      if (documented === undefined) problems.push(`${def.name}: 文件對照表沒有這一項`);
      else if (documented !== def.iconTier) {
        problems.push(`${def.name}: 文件 T${documented} / seed T${def.iconTier}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('對照表沒有列出 seed 已不存在的素材', () => {
    const names = new Set(MATERIALS.map(m => m.name));
    expect([...docTier.keys()].filter(n => !names.has(n))).toEqual([]);
  });
});

describe('素材 iconTier 資料本身的合理性', () => {
  it('通用製作素材遵循「基礎版 N／深層副本版 N+1」', () => {
    const pairs: [string, string][] = [
      ['銀礦石', '銀精華'],
      ['米索利碎片', '米索利礦石'],
      ['龍骨碎片', '龍心結晶'],
      ['奧里哈魯根碎片', '奧里哈魯根精華'],
    ];
    for (const [base, deep] of pairs) {
      const b = ITEM_DEFINITIONS.find(i => i.name === base)!;
      const d = ITEM_DEFINITIONS.find(i => i.name === deep)!;
      expect(d.iconTier, `${deep} 應為 ${base} + 1`).toBe(b.iconTier! + 1);
    }
  });

  it('每個素材都有 iconTier，且落在 1~7', () => {
    const bad = MATERIALS.filter(m => !m.iconTier || m.iconTier < 1 || m.iconTier > 7);
    expect(bad.map(m => m.name)).toEqual([]);
  });
});
