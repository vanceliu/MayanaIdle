import { describe, it, expect, beforeAll } from 'vitest';
import { getMapForRegion, clearMapCache } from '../mapDataControl';
import { isWalkableTile, type MapData } from '../mapControl';
import { REGIONS } from '../mapData';
import { useMapMonsterStore } from '../../stores/mapMonsterStore';

const TOWN_IDS = ['neutral-town', 'elsarth-town', 'varden-town'];

/** TownView 認得的設施 ID（NPC 的 facility 必須落在這組裡，否則點了開不出面板） */
const KNOWN_FACILITIES = new Set([
  'general-store', 'blacksmith', 'weapon-shop', 'armor-shop', 'inn', 'storage',
  'magic-academy', 'class-guild', 'starter-npc', 'adventurer-guild', 'statistics-center',
]);

describe('城鎮地圖（§ 99.6）', () => {
  let towns: MapData[];

  beforeAll(async () => {
    clearMapCache();
    towns = await Promise.all(TOWN_IDS.map(async id => {
      const map = await getMapForRegion(id);
      if (!map) throw new Error(`找不到城鎮地圖 ${id}`);
      return map;
    }));
  });

  it('每個 type=town 的區域都有對應地圖', () => {
    const townRegions = REGIONS.filter(r => r.type === 'town').map(r => r.id).sort();
    expect(townRegions).toEqual([...TOWN_IDS].sort());
  });

  it('尺寸 30×20、主題 town（§ 38.10 只允許三種尺寸）', () => {
    for (const map of towns) {
      expect(map.width, map.id).toBe(30);
      expect(map.height, map.id).toBe(20);
      expect(map.theme, map.id).toBe('town');
    }
  });

  it('NPC 有實體（自己的格子不可通行），且 facility 是 TownView 認得的', () => {
    for (const map of towns) {
      expect(map.npcs?.length, map.id).toBeGreaterThan(0);
      for (const npc of map.npcs!) {
        // 尋路要繞過 NPC，所以他站的格子必須擋路（§ 99.6）
        expect(isWalkableTile(map, npc), `${map.id} 的 ${npc.name}`).toBe(false);
        expect(KNOWN_FACILITIES.has(npc.facility), `${map.id} 的 ${npc.facility}`).toBe(true);
        expect(npc.icon.length, `${map.id} 的 ${npc.name} 沒有 icon`).toBeGreaterThan(0);
      }
    }
  });

  it('每個 NPC 至少有一個可通行的相鄰格，玩家靠得過去', () => {
    const offsets = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const map of towns) {
      for (const npc of map.npcs!) {
        const reachable = offsets.some(([dx, dy]) => isWalkableTile(map, { x: npc.x + dx, y: npc.y + dy }));
        expect(reachable, `${map.id} 的 ${npc.name} 四周都是牆`).toBe(true);
      }
    }
  });

  it('同一張地圖上沒有兩個 NPC 站同一格', () => {
    for (const map of towns) {
      const tiles = map.npcs!.map(n => `${n.x},${n.y}`);
      expect(new Set(tiles).size, map.id).toBe(tiles.length);
    }
  });

  it('只有中立城有新手指導員（§ 13.2 三城設施相同，指導員是例外）', () => {
    const byId = new Map(towns.map(m => [m.id, m]));
    const hasStarter = (id: string) => byId.get(id)!.npcs!.some(n => n.facility === 'starter-npc');

    expect(hasStarter('neutral-town')).toBe(true);
    expect(hasStarter('elsarth-town')).toBe(false);
    expect(hasStarter('varden-town')).toBe(false);
  });

  it('城鎮是安全區：spawnTick 不生成任何怪物', () => {
    const town = towns[0];
    useMapMonsterStore.setState({ monsters: [], spawnTimer: 0, paused: false });

    // 給足夠長的 delta，野外地圖在這個時間早就生出怪了
    useMapMonsterStore.getState().spawnTick(60_000, town, town.spawnPoint, 5, 30);

    expect(useMapMonsterStore.getState().monsters).toHaveLength(0);
  });
});
