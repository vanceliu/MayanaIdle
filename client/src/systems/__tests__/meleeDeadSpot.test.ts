import { describe, it, expect } from 'vitest';
import { findAttackPosition } from '../pathfinding';
import { hasLineOfSight, getDistance, isWithinAttackRange } from '../lineOfSight';
import { isWalkableTile } from '../../models/mapControl';
import { MELEE_WEAPON_RANGE } from '../../models/equipment';
import type { MapData, Position } from '../../models/mapControl';
import hundredPillar1 from '../../data/maps/hundred-pillar-1-10f.json';
import hundredPillar2 from '../../data/maps/hundred-pillar-11-20f.json';
import hundredPillar3 from '../../data/maps/hundred-pillar-21-30f.json';
import ancientBattlefield from '../../data/maps/ancient-battlefield.json';
import mistyCave from '../../data/maps/misty-cave-1f.json';

/**
 * 近戰死角回歸（`41-arpg-combat.md` § 3.1）。
 *
 * 死角 ＝ 打不到、又找不出落腳格。角色會清掉目標、下一幀重選同一隻，
 * 變成不出手也不移動的死結。柱子多的地圖踩得到，`findAttackPosition` 的
 * 起點格只會被判一次，判不過就再也回不來。
 */
const MAPS: [string, MapData][] = [
  ['百柱塔 1-10F', hundredPillar1 as unknown as MapData],
  ['百柱塔 11-20F', hundredPillar2 as unknown as MapData],
  ['百柱塔 21-30F', hundredPillar3 as unknown as MapData],
  ['遠古戰場', ancientBattlefield as unknown as MapData],
  ['迷霧洞窟 1F', mistyCave as unknown as MapData],
];

/** 角色停在格與格之間的各種落點 —— 死角只在非整數座標出現 */
const OFFSETS: Position[] = [
  { x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: -0.4, y: 0 }, { x: 0, y: 0.4 }, { x: 0, y: -0.4 },
  { x: 0.4, y: 0.4 }, { x: -0.4, y: 0.4 }, { x: 0.45, y: -0.45 }, { x: 0.49, y: 0.49 },
];

function deadSpots(map: MapData): string[] {
  const walkable: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWalkableTile(map, { x, y })) walkable.push({ x, y });
    }
  }

  const found: string[] = [];
  for (const monster of walkable) {
    for (const base of walkable) {
      if (getDistance(base, monster) > 3.5) continue;
      for (const offset of OFFSETS) {
        const player = { x: base.x + offset.x, y: base.y + offset.y };
        const tile = { x: Math.round(player.x), y: Math.round(player.y) };
        if (tile.x === monster.x && tile.y === monster.y) continue;
        if (!isWalkableTile(map, tile)) continue;
        if (isWithinAttackRange(player, monster, MELEE_WEAPON_RANGE)
          && hasLineOfSight(player, monster, map)) continue;

        const occupied = new Set([`${monster.x},${monster.y}`]);
        const spot = findAttackPosition(map, monster, player, MELEE_WEAPON_RANGE, occupied)
          ?? findAttackPosition(map, monster, player, MELEE_WEAPON_RANGE);
        if (!spot) found.push(`角色 ${player.x},${player.y} → 怪 ${monster.x},${monster.y}`);
      }
    }
  }
  return found;
}

describe('近戰不會出現「打不到又走不動」的位置', () => {
  it.each(MAPS)('%s', (_name, map) => {
    expect(deadSpots(map)).toEqual([]);
  });
});
