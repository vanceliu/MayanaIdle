/**
 * 競技場場地候選（`arena-map.html`，`55-arena.md`）。
 * 三種 30×30 版面，外圍為邊界；繪製沿用 `MapOutlineStage`（遊戲的第二代背景 render）。
 */
import { TileType, getTileDefinition, type MapData, type MapTheme } from '../src/models/mapControl';

export const ARENA_SIZE = 30;
const CENTER = { x: 15, y: 15 };

type Tile = (typeof TileType)[keyof typeof TileType];

function blank(): Tile[][] {
  return Array.from({ length: ARENA_SIZE }, (_, y) =>
    Array.from({ length: ARENA_SIZE }, (_, x) =>
      (x === 0 || y === 0 || x === ARENA_SIZE - 1 || y === ARENA_SIZE - 1 ? TileType.Boundary : TileType.Ground)));
}

/** 以中心為軸四向對稱放置 */
function mirror(tiles: Tile[][], x: number, y: number, t: Tile): void {
  const last = ARENA_SIZE - 1;
  for (const [px, py] of [[x, y], [last - x, y], [x, last - y], [last - x, last - y]]) tiles[py][px] = t;
}

/** A 柱陣：16 根柱子圍出中央空地，四角各一堆碎石 */
function pillarGrid(): Tile[][] {
  const t = blank();
  for (const x of [7, 11]) for (const y of [7, 11]) mirror(t, x, y, TileType.Pillar);
  for (const [x, y] of [[3, 3], [4, 3], [3, 4]]) mirror(t, x, y, TileType.Rock);
  return t;
}

/** B 環形：半徑 8 的牆圈，東南西北各留 3 格缺口；圈外四根柱子 */
function ring(): Tile[][] {
  const t = blank();
  for (let y = 1; y < ARENA_SIZE - 1; y++) {
    for (let x = 1; x < ARENA_SIZE - 1; x++) {
      const d = Math.hypot(x - CENTER.x + 0.5, y - CENTER.y + 0.5);
      const gap = Math.abs(x - CENTER.x + 0.5) < 2 || Math.abs(y - CENTER.y + 0.5) < 2;
      if (d >= 8.5 && d < 9.5 && !gap) t[y][x] = TileType.Wall;
    }
  }
  for (const [x, y] of [[4, 4]]) mirror(t, x, y, TileType.Pillar);
  return t;
}

/** C 廢墟：2×2 碎石與斷柱錯落，中央 5 格內淨空 */
function ruins(): Tile[][] {
  const t = blank();
  const rocks = [[5, 8], [9, 4], [12, 9], [6, 12]];
  for (const [x, y] of rocks) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) mirror(t, x + dx, y + dy, TileType.Rock);
  for (const [x, y] of [[4, 4], [10, 7], [8, 10], [13, 5]]) mirror(t, x, y, TileType.Pillar);
  return t;
}

export const LAYOUTS: { id: string; name: string; note: string; build: () => Tile[][] }[] = [
  { id: 'pillars', name: 'A 柱陣', note: '16 根柱子圍出中央空地；可繞柱拉怪，遠程有掩體', build: pillarGrid },
  { id: 'ring', name: 'B 環形', note: '中央圓形競技場，四向缺口；怪物從缺口湧入', build: ring },
  { id: 'ruins', name: 'C 廢墟', note: '碎石與斷柱錯落，地形最破碎；中央 5 格內淨空', build: ruins },
];

export function buildArenaMap(layoutId: string, theme: MapTheme): MapData {
  const layout = LAYOUTS.find(l => l.id === layoutId) ?? LAYOUTS[0];
  return {
    id: `arena-${layout.id}`, name: '競技場', width: ARENA_SIZE, height: ARENA_SIZE, theme,
    autoSpawn: false, spawnPoint: { ...CENTER }, tiles: layout.build(),
  } as MapData;
}

/** 從出生點可走到的格數 ÷ 全部可走格數；不是 100% 代表有封死的區塊 */
export function reachability(map: MapData): { reachable: number; walkable: number } {
  const walk = (x: number, y: number) => !!getTileDefinition(map.tiles[y]?.[x])?.walkable;
  let walkable = 0;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (walk(x, y)) walkable++;
  const seen = new Set<string>();
  const queue = [map.spawnPoint];
  while (queue.length) {
    const p = queue.pop()!;
    const key = `${p.x},${p.y}`;
    if (seen.has(key) || !walk(p.x, p.y)) continue;
    seen.add(key);
    queue.push({ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 });
  }
  return { reachable: seen.size, walkable };
}
