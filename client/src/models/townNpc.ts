/**
 * 城鎮 NPC 的顯示條件（`13-town.md` § 13.2.1）。
 * 公會 NPC 只在開放世界出現；單機世界門面保留、不放 NPC（`97-selfhosted-server.md` § 97.1）。
 */
import type { MapData, MapNpc } from './mapControl';

const MULTIPLAYER_ONLY_FACILITIES: ReadonlySet<string> = new Set(['guild']);

export function isFacilityVisible(facility: string, multiplayer: boolean): boolean {
  return multiplayer || !MULTIPLAYER_ONLY_FACILITIES.has(facility);
}

export function visibleNpcs(map: MapData, multiplayer: boolean): MapNpc[] {
  return (map.npcs ?? []).filter(npc => isFacilityVisible(npc.facility, multiplayer));
}
