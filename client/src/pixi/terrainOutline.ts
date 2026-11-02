import { getTileDefinition, type MapData, type Position, type TileVisualRole } from '../models/mapControl';

/** 第二代背景 render 畫整圈邊線的地形（`38-map-control.md` § 38.9） */
export const TERRAIN_EDGE_ROLES: readonly TileVisualRole[] = ['water', 'lava', 'chasm'];

export function isTerrainEdgeTile(map: MapData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  const role = getTileDefinition(map.tiles[y][x])?.role;
  return role !== undefined && TERRAIN_EDGE_ROLES.includes(role);
}

/** 格角座標 (i, j) 對應世界座標 (i − 0.5, j − 0.5) */
type Corner = readonly [number, number];

const key = (c: Corner): string => `${c[0]},${c[1]}`;

/**
 * 水／岩漿／深淵區域的外框，以世界座標的封閉折線回傳（每個迴圈不重複起點）。
 *
 * 邊線畫在這些格子與「不是這三種」的格子之間（含可走格、障礙物、地圖外）；
 * 三種彼此相鄰不畫。共線的連續邊合併成一段。
 */
export function traceTerrainOutlines(map: MapData): Position[][] {
  // 有向邊：區域在行進方向右側（螢幕座標順時針），每個起點最多兩條（對角相接時）
  const outgoing = new Map<string, Corner[]>();
  const addEdge = (from: Corner, to: Corner) => {
    const list = outgoing.get(key(from));
    if (list) list.push(to);
    else outgoing.set(key(from), [to]);
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isTerrainEdgeTile(map, x, y)) continue;
      if (!isTerrainEdgeTile(map, x, y - 1)) addEdge([x, y], [x + 1, y]);
      if (!isTerrainEdgeTile(map, x + 1, y)) addEdge([x + 1, y], [x + 1, y + 1]);
      if (!isTerrainEdgeTile(map, x, y + 1)) addEdge([x + 1, y + 1], [x, y + 1]);
      if (!isTerrainEdgeTile(map, x - 1, y)) addEdge([x, y + 1], [x, y]);
    }
  }

  const loops: Position[][] = [];
  for (const [startKey, ends] of outgoing) {
    while (ends.length > 0) {
      const start = startKey.split(',').map(Number) as unknown as Corner;
      const corners: Corner[] = [start];
      let next = ends.pop()!;
      while (key(next) !== startKey) {
        corners.push(next);
        const candidates = outgoing.get(key(next));
        if (!candidates || candidates.length === 0) break;
        next = candidates.pop()!;
      }
      loops.push(dropCollinear(corners).map(([i, j]) => ({ x: i - 0.5, y: j - 0.5 })));
    }
  }
  return loops;
}

function dropCollinear(corners: Corner[]): Corner[] {
  return corners.filter((c, i) => {
    const prev = corners[(i - 1 + corners.length) % corners.length];
    const next = corners[(i + 1) % corners.length];
    return (c[0] - prev[0]) * (next[1] - c[1]) !== (c[1] - prev[1]) * (next[0] - c[0]);
  });
}
