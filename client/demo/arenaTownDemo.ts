/**
 * 城鎮新增競技場建築（`arena-town.html`，`13-town.md` § 13.2.1、`55-arena.md`）。
 * 兩排六間的城鎮在廣場右側加一間（建築 x 19-21／y 8-9、NPC 站位 (20, 10)）；
 * 灰脊在第二、三階之間加一間（建築 x 19-22／y 11-12、NPC 站位 (20, 13)）。
 */
import { TileType, type MapData } from '../src/models/mapControl';

export interface TownPatch {
  building: { x0: number; x1: number; y0: number; y1: number };
  npc: { x: number; y: number };
}

export const TOWN_PATCHES: Record<string, TownPatch> = {
  'neutral-town': { building: { x0: 19, x1: 21, y0: 8, y1: 9 }, npc: { x: 20, y: 10 } },
  'elsarth-town': { building: { x0: 19, x1: 21, y0: 8, y1: 9 }, npc: { x: 20, y: 10 } },
  'varden-town': { building: { x0: 19, x1: 21, y0: 8, y1: 9 }, npc: { x: 20, y: 10 } },
  'greyridge-town': { building: { x0: 19, x1: 22, y0: 11, y1: 12 }, npc: { x: 20, y: 13 } },
};

export function patchTown(map: MapData): MapData {
  const p = TOWN_PATCHES[map.id];
  if (!p || map.npcs?.some(n => n.facility === 'arena')) return map;
  const tiles = map.tiles.map(row => [...row]);
  for (let y = p.building.y0; y <= p.building.y1; y++) for (let x = p.building.x0; x <= p.building.x1; x++) tiles[y][x] = TileType.Wall;
  tiles[p.npc.y][p.npc.x] = TileType.NpcStand;
  return { ...map, tiles, npcs: [...(map.npcs ?? []), { facility: 'arena', name: '競技場', icon: '🏟️', x: p.npc.x, y: p.npc.y }] } as MapData;
}
