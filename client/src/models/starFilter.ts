/**
 * 星盤篩選：以文字比對節點，符合的高亮、其餘變暗。
 * 比對文字＝節點類型（起點／星點／星座／命星）＋名稱（起點另含職業名）＋效果名稱＋命星規則；
 * 不分大小寫，空白分隔的每個關鍵字都要符合。
 */
import { STAR_FLAG_LABEL, type StarNode } from './starChart';
import { CLASS_NAMES_ZH } from './character';

export const STAR_KIND_LABEL: Record<StarNode['kind'], string> = {
  start: '起點', point: '星點', constellation: '星座', keystone: '命星',
};

export function starNodeSearchText(n: StarNode): string {
  return [
    STAR_KIND_LABEL[n.kind],
    n.name,
    n.kind === 'start' && n.classId ? CLASS_NAMES_ZH[n.classId] : '',
    ...n.effects.map(e => e.label),
    ...(n.flags ?? []).map(f => STAR_FLAG_LABEL[f]),
  ].join(' ').toLowerCase();
}

export function starFilterTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function starNodeMatches(n: StarNode, terms: readonly string[]): boolean {
  const text = starNodeSearchText(n);
  return terms.every(t => text.includes(t));
}
