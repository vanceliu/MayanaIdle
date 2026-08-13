import { describe, it, expect, beforeAll } from 'vitest';
import { getMapForRegion, clearMapCache } from '../mapDataControl';
import { TileType, isWalkableTile, type MapData } from '../mapControl';
import { REGIONS } from '../mapData';
import { useMapMonsterStore } from '../../stores/mapMonsterStore';

const TOWN_IDS = ['neutral-town', 'elsarth-town', 'varden-town'];

/** TownView 認得的設施 ID：NPC 的 facility 必須落在這組裡 */
const KNOWN_FACILITIES = new Set([
  'general-store', 'blacksmith', 'weapon-shop', 'armor-shop', 'inn', 'storage',
  'magic-academy', 'class-guild', 'starter-npc', 'adventurer-guild', 'statistics-center',
  'sigil-master', 'training-ground',
]);

describe('城鎮地圖（§ 13.2.1）', () => {
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
        // 尋路要繞過 NPC，所以他站的格子必須擋路（§ 13.2.1）
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

  /**
   * 版面規範（§ 13.2.1）：上下各一排六間建築，每個設施都有自己的門面。
   *
   * 這條是防止「又多一個設施就隨便找塊空地塞進去」——
   * 試驗場管理員一開始就是這樣被塞在沒有建築的 (26, 6)，整排看起來就歪了。
   */
  it('每個設施 NPC 都站在門口（正上方兩格是建築），只有新手指導員例外', () => {
    for (const map of towns) {
      for (const npc of map.npcs!) {
        if (npc.facility === 'starter-npc') continue; // 迎新的人站廣場，不佔門面
        expect([6, 15], `${map.id} 的 ${npc.name} 不在門口列`).toContain(npc.y);
        for (const dy of [1, 2]) {
          const tile = map.tiles[npc.y - dy][npc.x];
          expect(tile, `${map.id} 的 ${npc.name} 頭上沒有建築`).toBe(TileType.Wall);
        }
      }
    }
  });

  it('兩排各六個設施，且三城的門面數量一致', () => {
    for (const map of towns) {
      const facilities = map.npcs!.filter(n => n.facility !== 'starter-npc');
      expect(facilities.filter(n => n.y === 6), `${map.id} 上排`).toHaveLength(6);
      expect(facilities.filter(n => n.y === 15), `${map.id} 下排`).toHaveLength(6);
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
