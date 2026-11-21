/**
 * 星盤盤面、點數、配點／退點與效果加總（`56-star-chart.md`）。
 */
import { describe, it, expect } from 'vitest';
import {
  STAR_CLASS_ORDER, STAR_EDGES, STAR_NODES, STAR_NODE_BY_ID,
  KEYSTONE_CAP, exceedsKeystoneCap, normalizeStarAllocation, planStarChart, starPathTo, starPoints,
  starRefundCostPerPoint, starSkillLevel, starStartNodeId, sumStarEffects, unspentStarPoints,
} from '../starChart';
import { CLASS_SKILLS } from '../classSkills';


describe('盤面結構（§ 56.6）', () => {
  it('節點 id 不重複、連線兩端都存在', () => {
    expect(STAR_NODE_BY_ID.size).toBe(STAR_NODES.length);
    for (const [a, b] of STAR_EDGES) {
      expect(STAR_NODE_BY_ID.has(a)).toBe(true);
      expect(STAR_NODE_BY_ID.has(b)).toBe(true);
    }
  });

  it('節點數：起點 5、星點 264、星座 40、命星 17', () => {
    const count = (kind: string) => STAR_NODES.filter(n => n.kind === kind).length;
    expect([count('start'), count('point'), count('constellation'), count('keystone')]).toEqual([5, 264, 40, 17]);
  });

  it('職業支線：r480 → 星點 → 星座', () => {
    const linked = (a: string, b: string) => STAR_EDGES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    const fx = (id: string) => STAR_NODE_BY_ID.get(id)!.effects.map(e => `${e.key}:${e.value}`);
    for (const cls of STAR_CLASS_ORDER) {
      expect(linked(`${cls}-r480`, `${cls}-vow-p`)).toBe(true);
      expect(linked(`${cls}-vow-p`, `${cls}-vow-s`)).toBe(true);
    }
    expect([fx('knight-vow-p'), fx('knight-vow-s')]).toEqual([['attr:VIT:1'], ['atkPct:2', 'attr:STR:2', 'attr:VIT:2']]);
    expect([fx('thief-vow-p'), fx('thief-vow-s')]).toEqual([['mpFlat:20'], ['atkPct:2', 'attr:AGI:2', 'attr:VIT:2']]);
    expect([fx('elf-vow-p'), fx('elf-vow-s')]).toEqual([['mpFlat:20'], ['atkPct:2', 'attr:AGI:2', 'mpPct:2']]);
    expect([fx('elementalist-vow-p'), fx('elementalist-vow-s')]).toEqual([['mpFlat:20'], ['matkPct:2', 'attr:INT:2', 'attr:SPI:2']]);
    expect([fx('priest-vow-p'), fx('priest-vow-s')]).toEqual([['mpFlat:20'], ['matkPct:2', 'attr:INT:2', 'attr:SPI:2']]);
  });

  it('外側支線：冷卻縮減星點 → 命中／迴避星點 → 星座（命中 +2%、迴避值 +100、防禦 +2%）', () => {
    const linked = (a: string, b: string) => STAR_EDGES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    for (let i = 0; i < 5; i++) {
      expect(linked(`outer${i}`, `outer${i}-p`)).toBe(true);
      expect(linked(`outer${i}-p`, `outer${i}-s`)).toBe(true);
      expect(STAR_NODE_BY_ID.get(`outer${i}-p`)!.effects[0].key).toBe(i % 2 === 0 ? 'hit' : 'evasion');
      expect(STAR_NODE_BY_ID.get(`outer${i}-s`)!.effects.map(e => `${e.key}:${e.value}`)).toEqual(['hit:2', 'evasion:100', 'defPct:2']);
    }
  });

  it('職業命星連到每條職業魔法線的末端；命星是終點，不能經命星走到其他節點', () => {
    for (const cls of STAR_CLASS_ORDER) {
      const ends = STAR_EDGES.filter(([a, b]) => a === `${cls}-keystone` || b === `${cls}-keystone`);
      expect(ends).toHaveLength(7);
    }
    const viaChain0 = new Set(starPathTo('knight-magic0-level1', new Set(['knight-start']))!.concat('knight-start', 'knight-keystone'));
    expect(starPathTo('knight-magic6-level1', viaChain0)).toHaveLength(4);
    expect(normalizeStarAllocation([...viaChain0, 'knight-magic6-level1'], 'knight', 120)).not.toContain('knight-magic6-level1');
  });

  it('從任一職業起點都能到達所有節點', () => {
    const all = new Set(STAR_NODES.map(n => n.id));
    for (const cls of STAR_CLASS_ORDER) {
      for (const id of all) expect(starPathTo(id, new Set([starStartNodeId(cls)]))).not.toBeNull();
    }
  });

  it('閃避反擊、冷卻縮減沒有技能節點；其餘職業技能各有 2 強化＋2 等級', () => {
    for (const s of CLASS_SKILLS) {
      const nodes = STAR_NODES.filter(n => n.effects.some(e => e.key.startsWith(`skill:${s.id}:`)));
      if (s.id === 'dodge-counter' || s.id === 'cd-reduce') expect(nodes).toHaveLength(0);
      else expect(nodes).toHaveLength(4);
    }
  });
});

describe('點數（§ 56.1）', () => {
  it('Lv30 開放，Lv N 共 N − 29 點', () => {
    expect(starPoints(29)).toBe(0);
    expect(starPoints(30)).toBe(1);
    expect(starPoints(75)).toBe(46);
    expect(starPoints(120)).toBe(91);
  });

  it('洗點每點＝等級 × 1000', () => {
    expect(starRefundCostPerPoint(75)).toBe(75000);
  });

  it('未點點數：未滿 Lv30 為 0；起點算已點', () => {
    expect(unspentStarPoints({ level: 29 })).toBe(0);
    expect(unspentStarPoints({ level: 30, starChart: [starStartNodeId('elf')] })).toBe(0);
    expect(unspentStarPoints({ level: 33, starChart: [starStartNodeId('elf')] })).toBe(3);
    expect(unspentStarPoints({ level: 33, starChart: [] })).toBe(4);
  });
});

describe('存檔整理', () => {
  it('丟掉不存在與不相連的節點', () => {
    expect(normalizeStarAllocation(['knight-start', 'knight-r360', 'nope', 'elf-r360'], 'knight', 50))
      .toEqual(['knight-start', 'knight-r360']);
  });

  it('經由後點的節點仍相連者保留', () => {
    // 中環：騎士 r300 ↔ 橋接 bridge0-1…5 ↔ 盜賊 r300；順序先放遠端也要保留
    const chain = ['bridge0-2', 'bridge0-1', 'knight-r300', 'knight-r360'];
    expect(new Set(normalizeStarAllocation(chain, 'knight', 50))).toEqual(new Set(['knight-start', ...chain]));
  });

  it('未開放為空；超出點數依 BFS 順序截斷且仍相連', () => {
    expect(normalizeStarAllocation(['knight-start'], 'knight', 29)).toEqual([]);
    const a = normalizeStarAllocation(['knight-r360', 'knight-r300', 'knight-r240'], 'knight', 31);
    expect(a).toEqual(['knight-start', 'knight-r360']);
  });
});

describe('效果加總（§ 56.4、§ 56.5）', () => {
  it('同 key 相加；騎士起點力量 +2、體質 +2', () => {
    const { totals } = sumStarEffects(['knight-start', 'knight-r360', 'knight-r300'], 'knight');
    expect(totals.get('attr:STR')).toBe(3);
    expect(totals.get('attr:VIT')).toBe(3);
  });

  it('職業星盤屬性：騎士力量＋體質、盜賊敏捷＋力量、妖精敏捷＋體質、元素師與牧師智力＋精神', () => {
    const startAttrs = (c: string) => STAR_NODE_BY_ID.get(`${c}-start`)!.effects.map(e => `${e.key}:${e.value}`);
    expect(startAttrs('knight')).toEqual(['attr:STR:2', 'attr:VIT:2']);
    expect(startAttrs('thief')).toEqual(['attr:AGI:2', 'attr:STR:2']);
    expect(startAttrs('elf')).toEqual(['attr:AGI:2', 'attr:VIT:2']);
    expect(startAttrs('elementalist')).toEqual(['attr:INT:2', 'attr:SPI:2']);
    expect(startAttrs('priest')).toEqual(['attr:INT:2', 'attr:SPI:2']);
  });

  it('體質、精神只在起點、職業星座、命星與騎士／盜賊的體質節點；其餘每 1 點改最大 HP／MP +20', () => {
    const vitNodes: Record<string, number> = {
      'knight-r300': 1, 'knight-wheel1-p': 1, 'bridge0-2': 1, 'bridge4-2': 1, 'knight-wheel1-s': 2,
      'thief-r300': 1, 'bridge1-2': 1, 'thief-wheel1-s': 2, 'thief-side1-s': 2,
      'knight-vow-p': 1, 'knight-vow-s': 2, 'thief-vow-s': 2,
    };
    for (const [id, value] of Object.entries(vitNodes)) {
      expect(STAR_NODE_BY_ID.get(id)!.effects.find(e => e.key === 'attr:VIT')?.value, id).toBe(value);
    }
    for (const n of STAR_NODES) {
      if (n.kind === 'start' || n.kind === 'keystone' || n.id.endsWith('-hub') || n.id.endsWith('-vow-s') || n.id in vitNodes) continue;
      for (const e of n.effects) expect(['attr:VIT', 'attr:SPI'], n.id).not.toContain(e.key);
    }
    expect(STAR_NODE_BY_ID.get('knight-hub')!.effects.map(e => e.key)).toContain('attr:VIT');
    expect(STAR_NODE_BY_ID.get('priest-hub')!.effects.map(e => e.key)).toContain('attr:SPI');
    const side = STAR_NODE_BY_ID.get('knight-side1-1')!;
    expect(side.effects).toEqual([{ key: 'hpFlat', label: '最大 HP', value: 20, unit: '' }]);
    expect(side.name).toBe('最大 HP');
    expect(STAR_NODE_BY_ID.get('knight-side1-s')!.effects[0]).toMatchObject({ key: 'hpFlat', value: 40 });
    expect(STAR_NODE_BY_ID.get('elementalist-side1-s')!.effects[0]).toMatchObject({ key: 'mpFlat', value: 40 });
  });

  it('冷卻縮減 +1%：外側橋接 5 點與內環 4 點', () => {
    const ids = STAR_NODES.filter(n => n.effects.some(e => e.key === 'cdrPct')).map(n => n.id).sort();
    expect(ids).toEqual(['outer0', 'outer1', 'outer2', 'outer3', 'outer4', 'ring-3', 'ring-4', 'ring-8', 'ring-9']);
    expect(STAR_NODE_BY_ID.get('outer0')!.effects).toEqual([{ key: 'cdrPct', label: '冷卻縮減', value: 1, unit: '%' }]);
  });

  it('他職業的職業技能節點不生效', () => {
    const lv = STAR_NODES.find(n => n.id === 'thief-magic4-level0')!;
    expect(sumStarEffects([lv.id], 'knight').totals.size).toBe(0);
    expect(starSkillLevel(sumStarEffects([lv.id], 'thief').totals, 'backstab')).toBe(2);
  });

  it('技能等級上限 III', () => {
    const ids = ['knight-magic0-level0', 'knight-magic0-level1'];
    expect(starSkillLevel(sumStarEffects(ids, 'knight').totals, 'shield-bash')).toBe(3);
    expect(starSkillLevel(new Map(), 'shield-bash')).toBe(1);
  });

  it('中央生存星點與命星規則；盤面沒有基礎魔法節點', () => {
    const { totals, flags } = sumStarEffects(['center-60-1', 'center-60-2', 'center-0-k'], 'elf');
    expect([totals.get('hpPct'), totals.get('defPct')]).toEqual([1, 1]);
    expect(flags.has('bloodPact')).toBe(true);
    expect(totals.get('mpPct')).toBe(-50);
    expect(STAR_NODES.some(n => n.effects.some(e => e.key.startsWith('magic:')))).toBe(false);
  });
});

describe('套用整份配點（§ 56.7）', () => {
  it('合法目標回傳整理後配點與要付費的退回點數', () => {
    const r = planStarChart(['knight-start', 'knight-r360', 'knight-r300'], ['knight-start', 'knight-side0-1'], 'knight', 40);
    expect(r).toEqual({ allocated: ['knight-start', 'knight-side0-1'], refunded: 2 });
  });

  it('斷開、缺起點、超出點數、型別錯誤一律拒絕', () => {
    expect(planStarChart([], ['knight-start', 'knight-r300'], 'knight', 40)).toEqual({ error: 'invalid' });
    expect(planStarChart([], ['knight-r360'], 'knight', 40)).toEqual({ error: 'invalid' });
    expect(planStarChart([], ['knight-start', 'knight-r360', 'knight-r300'], 'knight', 31)).toEqual({ error: 'points' });
    expect(planStarChart([], 'knight-start', 'knight', 40)).toEqual({ error: 'shape' });
    expect(planStarChart([], [1], 'knight', 40)).toEqual({ error: 'shape' });
  });
});

describe('命星上限（§ 56.6）', () => {
  const keystoneIds = STAR_NODES.filter(n => n.kind === 'keystone').map(n => n.id);
  /** 從騎士起點點到前 n 顆命星的整條路徑 */
  const pathToKeystones = (n: number) => {
    const allocated = new Set([starStartNodeId('knight')]);
    for (const id of keystoneIds.slice(0, n)) starPathTo(id, allocated)!.forEach(x => allocated.add(x));
    return [...allocated];
  };

  it(`最多 ${KEYSTONE_CAP} 顆：第 4 顆的路徑會被擋，整份配點不合法，存檔整理只留 3 顆`, () => {
    const three = pathToKeystones(3);
    const fourthPath = starPathTo(keystoneIds[3], new Set(three))!;
    expect(exceedsKeystoneCap(fourthPath, new Set(three))).toBe(true);
    const four = [...three, ...fourthPath];
    expect(planStarChart([], four, 'knight', 120)).toEqual({ error: 'keystones' });
    expect(normalizeStarAllocation(four, 'knight', 120).filter(id => keystoneIds.includes(id))).toHaveLength(3);
    expect(planStarChart([], three, 'knight', 120)).toMatchObject({ refunded: 0 });
  });
});
