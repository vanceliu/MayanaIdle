import { describe, it, expect, beforeEach } from 'vitest';
import { useTownStore, resolveNpcArrival, findNpcNearTile, pickNpcApproachTile } from '../townStore';
import type { MapNpc } from '../../models/mapControl';

const NPC: MapNpc = { facility: 'general-store', name: '雜貨店', icon: '🛒', x: 3, y: 4 };

describe('findNpcNearTile（點到 NPC 圖示時的格子容錯，§ 99.6）', () => {
  const npcs = [
    { facility: 'general-store', x: 6, y: 6 },
    { facility: 'inn', x: 20, y: 6 },
  ];

  it('點到 NPC 那一格當然算', () => {
    expect(findNpcNearTile(npcs, { x: 6, y: 6 })?.facility).toBe('general-store');
  });

  it('點到相鄰格也算 —— 圓點與 icon 畫在格子上方，精準比對永遠對不上', () => {
    for (const tile of [{ x: 6, y: 5 }, { x: 5, y: 5 }, { x: 7, y: 7 }]) {
      expect(findNpcNearTile(npcs, tile)?.facility, JSON.stringify(tile)).toBe('general-store');
    }
  });

  it('離兩格以上就不算，否則走在路上亂點都會開面板', () => {
    expect(findNpcNearTile(npcs, { x: 6, y: 8 })).toBeNull();
    expect(findNpcNearTile(npcs, { x: 13, y: 6 })).toBeNull();
  });

  it('沒有 NPC 的地圖（野外）回 null', () => {
    expect(findNpcNearTile(undefined, { x: 1, y: 1 })).toBeNull();
    expect(findNpcNearTile([], { x: 1, y: 1 })).toBeNull();
  });

  it('兩個 NPC 都在範圍內時取最近的', () => {
    const close = [{ facility: 'a', x: 5, y: 5 }, { facility: 'b', x: 4, y: 4 }];
    expect(findNpcNearTile(close, { x: 5, y: 5 })?.facility).toBe('a');
  });
});

describe('resolveNpcArrival（點 NPC 後每幀的判定，§ 99.6）', () => {
  it('走到相鄰格就算到（不必踩在 NPC 身上）', () => {
    for (const pos of [{ x: 2, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 4, y: 5 }]) {
      expect(resolveNpcArrival(pos, NPC, true), JSON.stringify(pos)).toBe('open');
    }
  });

  it('站在 NPC 那一格也算到', () => {
    expect(resolveNpcArrival({ x: 3, y: 4 }, NPC, false)).toBe('open');
  });

  it('還在走就繼續等', () => {
    expect(resolveNpcArrival({ x: 10, y: 10 }, NPC, true)).toBe('walking');
  });

  it('停下來卻還沒到＝走不過去，放棄（否則面板會在莫名其妙的時間點跳出來）', () => {
    expect(resolveNpcArrival({ x: 10, y: 10 }, NPC, false)).toBe('give-up');
  });

  it('移動中的小數座標會先取整再判定', () => {
    expect(resolveNpcArrival({ x: 4.4, y: 3.6 }, NPC, true)).toBe('open');
  });

  it('沒有待處理的 NPC 時不做任何事', () => {
    expect(resolveNpcArrival({ x: 0, y: 0 }, null, false)).toBe('walking');
  });
});

describe('townStore（設施面板的兩個入口，§ 99.6）', () => {
  beforeEach(() => {
    useTownStore.setState({ facility: 'list', pendingNpc: null });
  });

  it('預設沒有開任何設施', () => {
    expect(useTownStore.getState().facility).toBe('list');
    expect(useTownStore.getState().pendingNpc).toBeNull();
  });

  it('點 NPC 只記下目標，不會馬上開面板（要先走過去）', () => {
    useTownStore.getState().requestNpc(NPC);

    expect(useTownStore.getState().pendingNpc).toEqual(NPC);
    expect(useTownStore.getState().facility).toBe('list');
  });

  it('走到之後開面板，同時清掉待處理的 NPC', () => {
    useTownStore.getState().requestNpc(NPC);
    useTownStore.getState().openFacility('general-store');

    expect(useTownStore.getState().facility).toBe('general-store');
    expect(useTownStore.getState().pendingNpc).toBeNull();
  });

  it('走不到時可以放棄，不會殘留狀態讓面板之後亂跳出來', () => {
    useTownStore.getState().requestNpc(NPC);
    useTownStore.getState().clearPendingNpc();

    expect(useTownStore.getState().pendingNpc).toBeNull();
    expect(useTownStore.getState().facility).toBe('list');
  });

  it('關閉面板會一併清掉待處理的 NPC', () => {
    useTownStore.getState().requestNpc(NPC);
    useTownStore.getState().openFacility('inn');
    useTownStore.getState().requestNpc(NPC);

    useTownStore.getState().closeFacility();

    expect(useTownStore.getState().facility).toBe('list');
    expect(useTownStore.getState().pendingNpc).toBeNull();
  });
});

describe('pickNpcApproachTile（NPC 有實體，要停在旁邊，§ 99.6）', () => {
  const npc = { x: 10, y: 10 };
  const allWalkable = () => true;

  it('挑離玩家最近的相鄰格，不會站到 NPC 身上', () => {
    const tile = pickNpcApproachTile(npc, { x: 10, y: 14 }, allWalkable);

    expect(tile).not.toEqual(npc);
    expect(Math.max(Math.abs(tile.x - npc.x), Math.abs(tile.y - npc.y))).toBe(1);
    expect(tile).toEqual({ x: 10, y: 11 }); // 玩家在下方 → 停在 NPC 下面那格
  });

  it('玩家在左邊就停左邊', () => {
    expect(pickNpcApproachTile(npc, { x: 3, y: 10 }, allWalkable)).toEqual({ x: 9, y: 10 });
  });

  it('小數座標（移動中）會先取整', () => {
    expect(pickNpcApproachTile(npc, { x: 3.4, y: 9.6 }, allWalkable)).toEqual({ x: 9, y: 10 });
  });

  it('只剩一格可通行時就挑那一格', () => {
    const onlyBelow = (t: { x: number; y: number }) => t.x === 10 && t.y === 11;
    expect(pickNpcApproachTile(npc, { x: 2, y: 2 }, onlyBelow)).toEqual({ x: 10, y: 11 });
  });

  it('四周都不可通行時回 NPC 本身，交給 moveToTarget 找最近可通行格', () => {
    expect(pickNpcApproachTile(npc, { x: 2, y: 2 }, () => false)).toEqual(npc);
  });
});
