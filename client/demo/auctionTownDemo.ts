/**
 * 城鎮新增拍賣場建築（`auction.html`，`13-town.md` § 13.2.1、`57-auction.md`）。
 * 兩排六間的城鎮在廣場左側加一間，與右側競技場對稱（建築 x 5-7／y 8-9、NPC 站位 (6, 10)）；
 * 灰脊在第二、三階之間左側加一間，與競技場對稱（建築 x 7-10／y 11-12、NPC 站位 (8, 13)）。
 */
import { TileType, type MapData } from '../src/models/mapControl';
import type { TownPatch } from './arenaTownDemo';

export const AUCTION_TOWN_PATCHES: Record<string, TownPatch> = {
  'neutral-town': { building: { x0: 5, x1: 7, y0: 8, y1: 9 }, npc: { x: 6, y: 10 } },
  'elsarth-town': { building: { x0: 5, x1: 7, y0: 8, y1: 9 }, npc: { x: 6, y: 10 } },
  'varden-town': { building: { x0: 5, x1: 7, y0: 8, y1: 9 }, npc: { x: 6, y: 10 } },
  'greyridge-town': { building: { x0: 7, x1: 10, y0: 11, y1: 12 }, npc: { x: 8, y: 13 } },
};

export function patchAuctionTown(map: MapData): MapData {
  const p = AUCTION_TOWN_PATCHES[map.id];
  if (!p || map.npcs?.some(n => n.facility === 'auction')) return map;
  const tiles = map.tiles.map(row => [...row]);
  for (let y = p.building.y0; y <= p.building.y1; y++) for (let x = p.building.x0; x <= p.building.x1; x++) tiles[y][x] = TileType.Wall;
  tiles[p.npc.y][p.npc.x] = TileType.NpcStand;
  return { ...map, tiles, npcs: [...(map.npcs ?? []), { facility: 'auction', name: '拍賣場', icon: '⚖️', x: p.npc.x, y: p.npc.y }] } as MapData;
}
