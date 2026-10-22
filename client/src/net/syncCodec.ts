/**
 * 狀態同步的欄位編碼（`97-selfhosted-server.md` § 97.2「狀態同步」）。
 * server 編碼與 client 還原共用此檔。
 */
import type { MapMonster } from '../stores/mapMonsterStore';
import type { AppendDelta, MonsterWire, StoreKey } from './protocol';

/** 非整值取代的欄位；未列出者一律 `set` */
export type FieldEncoding = 'merge' | 'append' | 'monsters';

export const FIELD_ENCODING: Partial<Record<StoreKey, Record<string, FieldEncoding>>> = {
  game: { character: 'merge', combatLogs: 'append' },
  mapMonster: { monsters: 'monsters' },
};

/**
 * `next` 若是 `prev` 尾端追加（可同時從頭部截掉）的結果，回傳新增的元素；否則回傳 null。
 * 元素以參照比對。
 */
export function appendedTail<T>(prev: readonly T[], next: readonly T[]): T[] | null {
  if (prev.length === 0) return next.slice();
  const i = next.lastIndexOf(prev[prev.length - 1]);
  if (i < 0) return null;
  const kept = i + 1;
  if (kept > prev.length) return null;
  const offset = prev.length - kept;
  for (let j = 0; j < kept; j++) if (next[j] !== prev[offset + j]) return null;
  return next.slice(kept);
}

export function applyAppend<T>(current: readonly T[] | undefined, delta: AppendDelta): T[] {
  const combined = [...(current ?? []), ...(delta.items as T[])];
  return combined.slice(Math.max(0, combined.length - delta.length));
}

/**
 * 同一物件的變動子鍵（參照比對）；有子鍵被移除或變成 `undefined` 時回傳 null（JSON 傳不了，改整值送）。
 */
export function changedFields(prev: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> | null {
  const diff: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) {
    if (prev[k] === v) continue;
    if (v === undefined) return null;
    diff[k] = v;
  }
  for (const k of Object.keys(prev)) if (!(k in next) && prev[k] !== undefined) return null;
  return diff;
}

export function toMonsterWire(m: MapMonster): MonsterWire {
  const wire: MonsterWire = { id: m.id, position: { x: m.position.x, y: m.position.y }, isBoss: m.isBoss };
  if (m.attackRange !== undefined) wire.attackRange = m.attackRange;
  if (m.dummy !== undefined) wire.dummy = m.dummy;
  return wire;
}

/** 還原成 store 的 `MapMonster`；`prevPosition` 取 client 上一次收到的同 id 位置 */
export function fromMonsterWire(wire: readonly MonsterWire[], current: readonly MapMonster[]): MapMonster[] {
  const prevById = new Map(current.map(m => [m.id, m.position]));
  return wire.map(w => ({
    id: w.id,
    position: w.position,
    prevPosition: prevById.get(w.id),
    targetPosition: w.position,
    speed: 0,
    path: [],
    pathIndex: 0,
    pathRecalcTimer: 0,
    moveTimer: 0,
    lastPathPlayerPos: w.position,
    isBoss: w.isBoss,
    attackRange: w.attackRange,
    dummy: w.dummy,
  }));
}
