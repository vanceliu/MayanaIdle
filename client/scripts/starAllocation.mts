/**
 * 模擬角色的星盤配點（`44-dps-prediction.md` § 44.2）。
 *
 *  1. 起點
 *  2. 依目標順序把職業技能整串點滿（強化 → 等級 → 強化 → 等級，即冷卻 −20%、等級 III；點數不足時停在半串）
 *  3. 剩餘點數貪婪分配：每次選「路徑上效果分數總和 ÷ 路徑點數」最高的節點
 *
 * 分數：輸出%（物理職業攻擊力%、法系魔法攻擊%）每 1% 得 1；主攻屬性每點 1；最大 HP% 每 1% 得 0.5；其餘 0（命星不點）。
 */
import {
  STAR_NODES, STAR_NODE_BY_ID, starNeighbors, starPoints, starStartNodeId, normalizeStarAllocation,
  type StarNode,
} from '../src/models/starChart';
import type { Attributes, ClassName } from '../src/models/character';
import { starNodeCost } from './starTweaks.mts';

/**
 * `attack-first`（預設）與 `skills-first`：輪替攻擊職業技能 → 輪替 buff → 其餘職業技能（兩者相同）；
 * `sustain-first`：續航類職業技能（回魔、回血、護盾、減傷）→ 其餘同 `attack-first`；
 * `stats-first`：不設目標，全部貪婪
 */
export type StarPolicy = 'attack-first' | 'skills-first' | 'stats-first' | 'sustain-first' | AnalysisPolicy;

/** 分析用：`none` 只有起點；其餘只對單一類節點計分（其他類節點只當路徑），點完該類就停 */
export type AnalysisPolicy = 'none' | 'attr-only' | 'offense-only' | 'skills-only';

const ANALYSIS_SCORE: Record<AnalysisPolicy, (key: string, input: StarPlanInput) => number> = {
  none: () => 0,
  'attr-only': (key, i) => (key === `attr:${i.mainStat}` ? 1 : 0),
  'offense-only': (key, i) => (key === i.offenseKey ? 1 : 0),
  'skills-only': (key, i) => (i.targets.some(t => (key === `skill:${t.skill}:level` || key === `skill:${t.skill}:cd`)) ? 1 : 0),
};

export type StarTarget = { skill: string; group: 'attack' | 'buff' | 'other'; sustain?: boolean };

export interface StarPlanInput {
  className: ClassName;
  level: number;
  /** 職業技能（已依優先順序） */
  targets: StarTarget[];
  mainStat: keyof Attributes;
  offenseKey: 'atkPct' | 'matkPct';
  policy?: StarPolicy;
}


/** 從已點集合出發的 BFS：每個未點節點的最短路徑（不含已點節點） */
function pathsFrom(allocated: ReadonlySet<string>): Map<string, string[]> {
  const prev = new Map<string, string | null>();
  const queue: string[] = [];
  for (const id of allocated) { prev.set(id, null); queue.push(id); }
  for (let i = 0; i < queue.length; i++) {
    for (const nb of starNeighbors(queue[i])) {
      if (prev.has(nb)) continue;
      prev.set(nb, queue[i]);
      queue.push(nb);
    }
  }
  const out = new Map<string, string[]>();
  for (const id of prev.keys()) {
    if (allocated.has(id)) continue;
    const path: string[] = [];
    for (let cur: string | null = id; cur !== null && !allocated.has(cur); cur = prev.get(cur) ?? null) path.unshift(cur);
    out.set(id, path);
  }
  return out;
}

/** 目標的終點節點：職業技能取最外側（第二個等級） */
function targetNode(className: ClassName, t: StarTarget): StarNode | null {
  const key = [`skill:${t.skill}:level`, `skill:${t.skill}:cd`];
  const nodes = STAR_NODES
    .filter(n => n.classId === className && n.effects.some(e => key.includes(e.key)))
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  return nodes[nodes.length - 1] ?? null;
}

function orderedTargets(targets: StarTarget[], policy: StarPolicy): StarTarget[] {
  if (policy !== 'attack-first' && policy !== 'skills-first' && policy !== 'sustain-first') return [];
  const rank = (t: StarTarget) => (policy === 'sustain-first' && t.sustain ? -1 : { attack: 0, buff: 1, other: 2 }[t.group]);
  return targets.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map(x => x.t);
}

function nodeScore(node: StarNode, input: StarPlanInput): number {
  if (node.kind === 'keystone') return 0;
  const analysis = ANALYSIS_SCORE[input.policy as AnalysisPolicy];
  if (analysis) return node.effects.reduce((sum, e) => sum + analysis(e.key, input) * Math.abs(e.value), 0);
  let s = 0;
  for (const e of node.effects) {
    if (e.key === input.offenseKey) s += e.value;
    else if (e.key === `attr:${input.mainStat}`) s += e.value;
    else if (e.key === 'hpPct') s += e.value * 0.5;
    else if (e.key === 'cdrPct') s += e.value;
  }
  return s;
}

export function simStarChart(input: StarPlanInput): string[] {
  const { className, level } = input;
  const budget = starPoints(level);
  if (budget <= 0) return [];
  const allocated = new Set([starStartNodeId(className)]);
  const cost = (ids: Iterable<string>) => [...ids].reduce((sum, id) => sum + starNodeCost(id), 0);
  const left = () => budget - cost(allocated);
  /** 路徑依花費取前段，花費不超過 n 點 */
  const affordable = (path: string[], n: number) => {
    const out: string[] = [];
    let spent = 0;
    for (const id of path) { spent += starNodeCost(id); if (spent > n) break; out.push(id); }
    return out;
  };

  for (const t of orderedTargets(input.targets, input.policy ?? 'attack-first')) {
    const end = targetNode(className, t);
    if (!end) continue;
    const path = pathsFrom(allocated).get(end.id) ?? [];
    for (const n of affordable(path, Math.max(0, left()))) allocated.add(n);
    if (left() <= 0) break;
  }

  while (left() > 0) {
    let best: { path: string[]; rate: number } | null = null;
    for (const path of pathsFrom(allocated).values()) {
      const pathCost = cost(path);
      if (path.length === 0 || pathCost > left()) continue;
      const score = path.reduce((s, id) => s + nodeScore(STAR_NODE_BY_ID.get(id)!, input), 0);
      if (score <= 0) continue;
      const rate = pathCost === 0 ? Number.POSITIVE_INFINITY : score / pathCost;
      if (!best || rate > best.rate + 1e-9 || (Math.abs(rate - best.rate) <= 1e-9 && path.length < best.path.length)) {
        best = { path, rate };
      }
    }
    if (!best) break;
    for (const id of best.path) allocated.add(id);
  }
  // 節點花費不是 1 時，節點數可超過點數，不走 normalize 的截斷
  return cost(allocated) === allocated.size ? normalizeStarAllocation([...allocated], className, level) : [...allocated];
}
