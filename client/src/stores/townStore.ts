import { create } from 'zustand';
import type { MapNpc } from '../models/mapControl';
import type { TownFacility } from '../components/TownView';

interface TownState {
  /** 目前開啟的設施面板；'list' 代表沒開 */
  facility: TownFacility;
  /** 點了 NPC 但還沒走到：走到相鄰格才會開面板（§ 99.6 決策 3） */
  pendingNpc: MapNpc | null;
  openFacility: (facility: TownFacility) => void;
  closeFacility: () => void;
  requestNpc: (npc: MapNpc) => void;
  clearPendingNpc: () => void;
}

export type NpcArrivalResult = 'open' | 'give-up' | 'walking';

const NEIGHBOUR_OFFSETS: readonly { x: number; y: number }[] = [
  { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

/**
 * 找出「站在 NPC 旁邊」的落腳格（§ 99.6）。
 *
 * NPC 有實體，角色不該直接站到他身上，所以移動目標取他的相鄰格 ——
 * 從玩家目前位置最近的那一格開始挑，挑不到（四周都不可通行）才回 NPC 本身，
 * 讓 `moveToTarget` 自己去找最近的可通行格。
 */
export function pickNpcApproachTile(
  npc: { x: number; y: number },
  from: { x: number; y: number },
  isWalkable: (tile: { x: number; y: number }) => boolean,
): { x: number; y: number } {
  const fromTile = { x: Math.round(from.x), y: Math.round(from.y) };
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;

  for (const offset of NEIGHBOUR_OFFSETS) {
    const tile = { x: npc.x + offset.x, y: npc.y + offset.y };
    if (!isWalkable(tile)) continue;
    const distance = Math.max(Math.abs(tile.x - fromTile.x), Math.abs(tile.y - fromTile.y));
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }

  return best ?? { x: npc.x, y: npc.y };
}

/**
 * 找出點擊格附近的 NPC（§ 99.6）。
 *
 * 不能只比對「完全相同的格子」：NPC 的圓點與 icon 畫在格子的**上方**
 * （圓心在 -RADIUS），玩家點圖示時換算出來的格子會是它上面那一格，
 * 精準比對永遠對不上，面板就永遠不會開。
 */
export function findNpcNearTile<T extends { x: number; y: number }>(
  npcs: readonly T[] | undefined,
  tile: { x: number; y: number },
): T | null {
  if (!npcs?.length) return null;
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const npc of npcs) {
    const distance = Math.max(Math.abs(npc.x - tile.x), Math.abs(npc.y - tile.y));
    if (distance <= 1 && distance < bestDistance) {
      best = npc;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * 點了 NPC 之後每一幀的判定（§ 99.6 決策 3）。
 *
 * 抽成純函式是因為原本寫在 Pixi 的 ticker 裡完全測不到 —— 而這裡有兩個容易錯的邊界：
 * 走到「相鄰格」就算到（不必踩在 NPC 身上），以及停下來卻還沒到就要放棄，
 * 不然玩家被擋住後面板會在莫名其妙的時間點跳出來。
 */
export function resolveNpcArrival(
  playerPos: { x: number; y: number },
  npc: { x: number; y: number } | null,
  isMoving: boolean,
): NpcArrivalResult {
  if (!npc) return 'walking';
  const dx = Math.abs(Math.round(playerPos.x) - npc.x);
  const dy = Math.abs(Math.round(playerPos.y) - npc.y);
  if (Math.max(dx, dy) <= 1) return 'open';
  return isMoving ? 'walking' : 'give-up';
}

/**
 * 城鎮設施的開關狀態。
 *
 * 從 `TownView` 的區域 state 抽出來，是因為現在有兩個入口：
 * 設施 icon 快捷列（React）與地圖上的 NPC（Pixi），兩邊要開同一個面板。
 */
export const useTownStore = create<TownState>((set) => ({
  facility: 'list',
  pendingNpc: null,
  openFacility: (facility) => set({ facility, pendingNpc: null }),
  closeFacility: () => set({ facility: 'list', pendingNpc: null }),
  requestNpc: (npc) => set({ pendingNpc: npc }),
  clearPendingNpc: () => set({ pendingNpc: null }),
}));
