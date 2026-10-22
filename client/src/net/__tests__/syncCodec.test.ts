import { describe, it, expect } from 'vitest';
import { appendedTail, applyAppend, changedFields, fromMonsterWire, toMonsterWire } from '../syncCodec';
import type { MapMonster } from '../../stores/mapMonsterStore';

/** 狀態同步的欄位編碼（`97-selfhosted-server.md` § 97.2「狀態同步」） */
describe('appendedTail', () => {
  const a = { n: 1 }, b = { n: 2 }, c = { n: 3 }, d = { n: 4 };

  it('尾端追加：只回傳新增的元素', () => {
    expect(appendedTail([a, b], [a, b, c, d])).toEqual([c, d]);
  });

  it('頭部截掉同時尾端追加：仍視為追加', () => {
    expect(appendedTail([a, b, c], [b, c, d])).toEqual([d]);
  });

  it('沒有變動回傳空陣列', () => {
    expect(appendedTail([a, b], [a, b])).toEqual([]);
  });

  it('上次是空陣列：全部視為新增', () => {
    expect(appendedTail([], [a, b])).toEqual([a, b]);
  });

  it('整份換掉或清空：回傳 null', () => {
    expect(appendedTail([a, b], [c, d])).toBeNull();
    expect(appendedTail([a, b], [])).toBeNull();
  });

  it('保留段與上次不一致：回傳 null', () => {
    expect(appendedTail([a, b], [c, b, d])).toBeNull();
  });

  it('client 套用後與 server 陣列相同（含上限截斷）', () => {
    const prev = [a, b, c];
    const next = [b, c, d];
    const items = appendedTail(prev, next)!;
    expect(applyAppend(prev, { items, length: next.length })).toEqual(next);
  });

  it('length 為 0 時套用結果為空', () => {
    expect(applyAppend([a], { items: [], length: 0 })).toEqual([]);
  });
});

describe('changedFields', () => {
  it('只回傳參照不同的子鍵', () => {
    const shared = { x: 1 };
    expect(changedFields({ hp: 10, mp: 5, attrs: shared }, { hp: 9, mp: 5, attrs: shared })).toEqual({ hp: 9 });
  });

  it('子鍵移除或變成 undefined：回傳 null', () => {
    expect(changedFields({ hp: 10, buff: 1 }, { hp: 10 })).toBeNull();
    expect(changedFields({ hp: 10, buff: 1 }, { hp: 10, buff: undefined })).toBeNull();
  });
});

describe('怪物線上格式', () => {
  const monster: MapMonster = {
    id: 'm1', position: { x: 3, y: 4 }, prevPosition: { x: 2, y: 4 }, targetPosition: { x: 9, y: 9 },
    speed: 2, path: [{ x: 5, y: 5 }], pathIndex: 1, pathRecalcTimer: 100, moveTimer: 50,
    lastPathPlayerPos: { x: 9, y: 9 }, isBoss: true, attackRange: 4,
  };

  it('只送顯示用欄位', () => {
    expect(toMonsterWire(monster)).toEqual({ id: 'm1', position: { x: 3, y: 4 }, isBoss: true, attackRange: 4 });
  });

  it('還原時 prevPosition 取 client 上一次的同 id 位置，新怪沒有 prevPosition', () => {
    const current = [{ ...monster, position: { x: 1, y: 1 } }];
    const [same, fresh] = fromMonsterWire(
      [{ id: 'm1', position: { x: 2, y: 1 }, isBoss: false }, { id: 'm2', position: { x: 7, y: 7 }, isBoss: false }],
      current,
    );
    expect(same.position).toEqual({ x: 2, y: 1 });
    expect(same.prevPosition).toEqual({ x: 1, y: 1 });
    expect(fresh.prevPosition).toBeUndefined();
  });
});
