/**
 * 星盤的顯示用資料（`56-star-chart.md`）：效果文字、節點半徑與配色、加成合計。
 * 遊戲星盤面板與管理介面角色查詢（`97-selfhosted-server.md` § 97.8）共用；不含 React。
 */
import {
  STAR_COOLDOWN_BY_NODES, STAR_FLAG_LABEL, STAR_NODE_BY_ID, STAR_POINT_VALUE, STAR_SKILL_LEVEL_CAP,
  isStarEffectActive, type StarEffect, type StarNode,
} from './starChart';
import type { ClassName } from './character';

export const STAR_NODE_RADIUS: Record<StarNode['kind'], number> = {
  start: 16, point: 7, constellation: 12, keystone: 16,
};

export const STAR_ROMAN = ['I', 'II', 'III'] as const;

export const formatStarEffect = (e: Pick<StarEffect, 'value' | 'unit'>) => `${e.value > 0 ? '+' : ''}${e.value}${e.unit}`;
export const starEffectText = (e: StarEffect) => e.text ?? `${e.label} ${formatStarEffect(e)}`;

/** 節點顏色依屬性效果：單一屬性為該色，兩種屬性左右各半，其餘白色（§ 56.6） */
const ATTR_COLOR_KEYS = ['str', 'agi', 'int', 'spi', 'vit'];
export function starNodeAttrs(n: StarNode): string[] {
  if (n.kind === 'keystone') return [];
  const attrs = n.effects.map(e => e.key.replace(/^attr:/, '').toLowerCase()).filter(k => ATTR_COLOR_KEYS.includes(k));
  return [...new Set(attrs)].slice(0, 2);
}
export const starMixId = ([a, b]: string[]) => `star-mix-${a}-${b}`;
export function starNodeFill(n: StarNode): string {
  const attrs = starNodeAttrs(n);
  if (attrs.length === 2) return `url(#${starMixId(attrs)})`;
  return `var(--star-${attrs[0] ?? 'other'})`;
}
/** 盤面用到的雙屬性漸層 */
export const starMixPairs = (nodes: readonly StarNode[]): string[][] =>
  [...new Map(nodes.map(starNodeAttrs).filter(a => a.length === 2).map(a => [starMixId(a), a])).values()];

export interface StarSummaryRow { key: string; label: string; value: number; unit: StarEffect['unit']; effective: boolean; valueText?: string }

export interface StarSummary {
  attrs: StarSummaryRow[];
  stats: StarSummaryRow[];
  skills: StarSummaryRow[];
  keystones: { name: string; flags: string[] }[];
}

/** 冷卻依節點數表的技能：冷卻列改顯示目前冷卻秒數（§ 56.5） */
function withCooldownSeconds(rows: Map<string, StarSummaryRow>) {
  for (const [id, steps] of Object.entries(STAR_COOLDOWN_BY_NODES)) {
    for (const effective of [true, false]) {
      const cd = rows.get(`skill:${id}:cd|${effective}`);
      if (!cd) continue;
      const nodes = -cd.value / STAR_POINT_VALUE.skillCd + (rows.get(`skill:${id}:level|${effective}`)?.value ?? 0);
      cd.valueText = `${steps[Math.min(steps.length - 1, nodes)] / 1000}s`;
    }
  }
}

/** 已點節點的加成合計：同 key 相加，生效與不生效分列（§ 56.4） */
export function summarizeStarChart(allocated: Iterable<string>, classId: ClassName): StarSummary {
  const rows = new Map<string, StarSummaryRow>();
  const keystones: StarSummary['keystones'] = [];
  for (const id of allocated) {
    const node = STAR_NODE_BY_ID.get(id);
    if (!node) continue;
    if (node.kind === 'keystone') keystones.push({ name: node.name, flags: (node.flags ?? []).map(f => STAR_FLAG_LABEL[f]) });
    for (const e of node.effects) {
      const effective = isStarEffectActive(e, node, classId);
      const key = `${e.key}|${effective}`;
      const row = rows.get(key);
      if (row) row.value += e.value;
      else rows.set(key, { key, label: e.label, value: e.value, unit: e.unit, effective });
    }
  }
  withCooldownSeconds(rows);
  const all = [...rows.values()];
  return {
    attrs: all.filter(r => r.key.startsWith('attr:')),
    stats: all.filter(r => !/^(attr|skill|magic):/.test(r.key)),
    skills: all.filter(r => /^(skill|magic):/.test(r.key)),
    keystones,
  };
}

/** 技能列的名稱與數值：等級列為 `名稱(II)`，其餘為 `名稱 數值`（§ 56.5） */
export function starSkillRowParts(r: StarSummaryRow): { label: string; value: string; bracket: boolean } {
  if (/^(?:skill|magic):.+:level\|/.test(r.key)) {
    const level = Math.min(1 + r.value, STAR_SKILL_LEVEL_CAP);
    return { label: r.label.replace(/ 等級$/, ''), value: STAR_ROMAN[level - 1], bracket: true };
  }
  return { label: r.label, value: r.valueText ?? formatStarEffect(r), bracket: false };
}
