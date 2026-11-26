import { describe, it, expect } from 'vitest';
import { buildStarView } from '../adminStarView';
import { KEYSTONE_CAP, STAR_NODES, starNeighbors, starPoints, starStartNodeId } from '../../../client/src/models/starChart';

const start = starStartNodeId('knight');
const neighbor = starNeighbors(start)[0];
const knightSkillNode = STAR_NODES.find(n => n.classId === 'knight' && n.effects.some(e => e.key.startsWith('skill:')))!;
const keystone = STAR_NODES.find(n => n.kind === 'keystone' && n.flags?.length)!;
const indexOf = (id: string) => STAR_NODES.findIndex(n => n.id === id);

describe('管理介面角色查詢的星盤（`97-selfhosted-server.md` § 97.8）', () => {
  it('未滿開放等級：未開放、0 點', () => {
    expect(buildStarView({ className: 'knight', level: 7 })).toMatchObject({ unlocked: false, used: 0, total: 0, keystones: 0, summary: [] });
  });

  it('點數、命星數與盤面已點節點', () => {
    const view = buildStarView({ className: 'knight', level: 40, starChart: [start, neighbor, keystone.id] });
    expect(view).toMatchObject({ unlocked: true, used: 3, total: starPoints(40), keystones: 1, keystoneCap: KEYSTONE_CAP });
    expect(view.svg.match(/class="star-node [^"]*is-allocated/g)).toHaveLength(3);
    expect(view.svg.match(/class="star-edge is-allocated"/g)).toHaveLength(1);
    expect(view.svg).toContain(`data-n="${indexOf(start)}"`);
    expect(view.tips).toHaveLength(STAR_NODES.length);
    expect(view.tips[indexOf(start)]).toMatchObject({ name: '騎士起點', kind: '起點', status: '已點' });
    expect(view.tips[indexOf(knightSkillNode.id)].status).toBeUndefined();
  });

  it('加成合計分組；命星列出規則文字', () => {
    const { summary } = buildStarView({ className: 'knight', level: 40, starChart: [start, keystone.id] });
    expect(summary.map(g => g.title)).toEqual(['屬性', '數值', '命星']);
    expect(summary[0].lines.every(l => l.value?.startsWith('+') && !l.inert)).toBe(true);
    expect(summary[2].lines).toEqual([{ text: expect.stringMatching(new RegExp(`^${keystone.name}：.+`)) }]);
  });

  it('其他職業的職業魔法節點標為不生效（合計與 tooltip）', () => {
    const view = buildStarView({ className: 'elf', level: 40, starChart: [knightSkillNode.id] });
    const skills = view.summary.find(g => g.title === '技能')!;
    expect(skills.lines.every(l => l.inert)).toBe(true);
    expect(view.tips[indexOf(knightSkillNode.id)].lines.some(l => l.inert)).toBe(true);
    expect(buildStarView({ className: 'knight', level: 40, starChart: [knightSkillNode.id] }).summary.find(g => g.title === '技能')!.lines.every(l => !l.inert)).toBe(true);
  });
});
