/**
 * 城鎮 NPC 的顯示條件（`13-town.md` § 13.2.1）。
 * 公會 NPC 與拍賣場只在開放世界出現；單機世界建築保留、不放 NPC（`97-selfhosted-server.md` § 97.1）。
 * 暫時關閉的設施兩種世界都不放 NPC，建築保留（`57-auction.md` § 57.0）。
 */
import type { MapData, MapNpc } from './mapControl';
import { AUCTION_ENABLED } from './auction';

const MULTIPLAYER_ONLY_FACILITIES: ReadonlySet<string> = new Set(['guild', 'auction']);

export const CLOSED_FACILITIES: ReadonlySet<string> = new Set(AUCTION_ENABLED ? [] : ['auction']);

export function isFacilityVisible(facility: string, multiplayer: boolean, closed: ReadonlySet<string> = CLOSED_FACILITIES): boolean {
  if (closed.has(facility)) return false;
  return multiplayer || !MULTIPLAYER_ONLY_FACILITIES.has(facility);
}

export function visibleNpcs(map: MapData, multiplayer: boolean, closed: ReadonlySet<string> = CLOSED_FACILITIES): MapNpc[] {
  return (map.npcs ?? []).filter(npc => isFacilityVisible(npc.facility, multiplayer, closed));
}
