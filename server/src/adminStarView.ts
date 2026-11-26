/**
 * 管理介面角色查詢的星盤（`97-selfhosted-server.md` § 97.8）：點數、加成合計、唯讀盤面 SVG 與節點 tooltip。
 * 盤面、配色、加總沿用遊戲星盤（`56-star-chart.md`、`models/starDisplay.ts`）；不可平移縮放。
 */
import {
  KEYSTONE_CAP, STAR_CHART_UNLOCK_LEVEL, STAR_EDGES, STAR_FLAG_LABEL, STAR_NODES, STAR_NODE_BY_ID,
  countKeystones, isStarEffectActive, starPoints, starStartNodeId,
} from '../../client/src/models/starChart';
import {
  STAR_NODE_RADIUS, formatStarEffect, starEffectText, starMixId, starMixPairs, starNodeFill, starSkillRowParts, summarizeStarChart,
  type StarSummaryRow,
} from '../../client/src/models/starDisplay';
import { STAR_KIND_LABEL } from '../../client/src/models/starFilter';
import { CLASS_NAMES_ZH, type Character } from '../../client/src/models/character';

const BOARD_HALF = 990;
/** 滑鼠感應半徑（盤面座標）；盤面縮到視窗寬時星點只有幾個像素 */
const HIT_RADIUS = 26;
const START_LABEL_SIZE = 44;

export interface StarLine {
  text: string;
  /** 數值部分，標黃（同遊戲 `.stat-changed`） */
  value?: string;
  /** 數值以括號接在名稱後：`名稱(II)` */
  bracket?: boolean;
  inert?: boolean;
}

export interface StarNodeTip {
  name: string;
  kind: string;
  lines: StarLine[];
  status?: string;
}

export interface StarView {
  unlocked: boolean;
  unlockLevel: number;
  used: number;
  total: number;
  keystones: number;
  keystoneCap: number;
  summary: { title: string; lines: StarLine[] }[];
  /** 節點帶 `data-n`，對應 `tips` 的索引 */
  svg: string;
  tips: StarNodeTip[];
}

const rowLine = (r: StarSummaryRow, skill: boolean): StarLine => {
  const parts = skill ? starSkillRowParts(r) : { label: r.label, value: formatStarEffect(r), bracket: false };
  return { text: parts.label, value: parts.value, bracket: parts.bracket, inert: !r.effective };
};

function boardSvg(allocated: ReadonlySet<string>, ownStart: string): string {
  const defs = starMixPairs(STAR_NODES).map(([a, b]) =>
    `<linearGradient id="${starMixId([a, b])}"><stop offset="50%" style="stop-color:var(--star-${a})"/><stop offset="50%" style="stop-color:var(--star-${b})"/></linearGradient>`).join('');
  const edges = STAR_EDGES.map(([a, b]) => {
    const na = STAR_NODE_BY_ID.get(a)!;
    const nb = STAR_NODE_BY_ID.get(b)!;
    const state = allocated.has(a) && allocated.has(b) ? ' is-allocated' : '';
    return `<line class="star-edge${state}" x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}"/>`;
  }).join('');
  const nodes = STAR_NODES.map((n, i) => {
    const cls = `star-node kind-${n.kind}${allocated.has(n.id) ? ' is-allocated' : ''}${n.id === ownStart ? ' is-own-start' : ''}`;
    const halo = n.kind === 'keystone' ? `<circle class="star-halo" r="${STAR_NODE_RADIUS.keystone + 6}"/>` : '';
    const label = n.kind === 'start'
      ? `<text class="star-label" y="${STAR_NODE_RADIUS.start + START_LABEL_SIZE}" font-size="${START_LABEL_SIZE}">${CLASS_NAMES_ZH[n.classId!]}</text>`
      : '';
    return `<g class="${cls}" data-n="${i}" transform="translate(${n.x} ${n.y})">${halo}` +
      `<circle class="star-dot" r="${STAR_NODE_RADIUS[n.kind]}" style="fill:${starNodeFill(n)}"/>${label}<circle class="star-hit" r="${HIT_RADIUS}"/></g>`;
  }).join('');
  return `<svg viewBox="${-BOARD_HALF} ${-BOARD_HALF} ${BOARD_HALF * 2} ${BOARD_HALF * 2}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>${defs}</defs>${edges}${nodes}</svg>`;
}

export function buildStarView(char: Pick<Character, 'className' | 'level' | 'starChart'>): StarView {
  const list = char.starChart ?? [];
  const allocated = new Set(list);
  const ownStart = starStartNodeId(char.className);
  const sum = summarizeStarChart(list, char.className);
  const summary = [
    { title: '屬性', lines: sum.attrs.map(r => rowLine(r, false)) },
    { title: '數值', lines: sum.stats.map(r => rowLine(r, false)) },
    { title: '技能', lines: sum.skills.map(r => rowLine(r, true)) },
    { title: '命星', lines: sum.keystones.map(k => ({ text: k.name + (k.flags.length > 0 ? `：${k.flags.join('；')}` : '') })) },
  ].filter(g => g.lines.length > 0);
  const tips = STAR_NODES.map((n): StarNodeTip => ({
    name: n.kind === 'start' ? `${CLASS_NAMES_ZH[n.classId!]}${n.name}` : n.name,
    kind: STAR_KIND_LABEL[n.kind],
    lines: [
      ...n.effects.map(e => ({ text: starEffectText(e), inert: !isStarEffectActive(e, n, char.className) })),
      ...(n.flags ?? []).map(f => ({ text: STAR_FLAG_LABEL[f] })),
    ],
    status: allocated.has(n.id) ? '已點' : undefined,
  }));
  return {
    unlocked: char.level >= STAR_CHART_UNLOCK_LEVEL,
    unlockLevel: STAR_CHART_UNLOCK_LEVEL,
    used: list.length,
    total: starPoints(char.level),
    keystones: countKeystones(list),
    keystoneCap: KEYSTONE_CAP,
    summary,
    svg: boardSvg(allocated, ownStart),
    tips,
  };
}
