import type { MapData, MapTheme, Position } from './mapControl';
import { TILE_DEFINITIONS, TileType, canTransition, isInBounds, isSpawnableTile, isWalkableTile } from './mapControl';

const mapModules = import.meta.glob<MapData>('../data/maps/*.json', { eager: false, import: 'default' });
const mapCache = new Map<string, MapData>();

export const MAP_THEMES: readonly MapTheme[] = [
  'grassland', 'highland', 'snow', 'ivory', 'forest', 'swamp', 'cave', 'prison',
  'battlefield', 'ancient', 'dragon', 'tower', 'frost-tower', 'lava-tower',
  'town',
];

function getMapKey(id: string): string | null {
  const suffix = `/${id}.json`;
  return Object.keys(mapModules).find(path => path.endsWith(suffix)) ?? null;
}

function assert(condition: unknown, mapId: string, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid map "${mapId}": ${message}`);
}

export function validateMapData(data: MapData, expectedId = data.id): MapData {
  assert(data && typeof data === 'object', expectedId, 'map data must be an object');
  assert(data.id === expectedId, expectedId, `JSON id must equal requested id (received "${data.id}")`);
  assert(typeof data.name === 'string' && data.name.length > 0, expectedId, 'name is required');
  assert(Number.isInteger(data.width) && data.width > 0, expectedId, 'width must be a positive integer');
  assert(Number.isInteger(data.height) && data.height > 0, expectedId, 'height must be a positive integer');
  assert(data.theme !== undefined && MAP_THEMES.includes(data.theme), expectedId, `unsupported theme "${String(data.theme)}"`);
  assert(Array.isArray(data.tiles) && data.tiles.length === data.height, expectedId, 'tiles row count must equal height');

  for (let y = 0; y < data.height; y++) {
    const row = data.tiles[y];
    assert(Array.isArray(row) && row.length === data.width, expectedId, `row ${y} width must equal ${data.width}`);
    for (let x = 0; x < data.width; x++) {
      const tile = row[x];
      assert(Number.isInteger(tile) && TILE_DEFINITIONS[tile as keyof typeof TILE_DEFINITIONS], expectedId, `unsupported tile ${tile} at ${x},${y}`);
      if (x === 0 || y === 0 || x === data.width - 1 || y === data.height - 1) {
        assert(tile === TileType.Boundary, expectedId, `outer edge ${x},${y} must be Boundary`);
      }
    }
  }

  assert(isInBounds(data, data.spawnPoint), expectedId, 'spawnPoint is outside map bounds');
  assert(isWalkableTile(data, data.spawnPoint), expectedId, 'spawnPoint must be walkable');
  assert(isSpawnableTile(data, data.spawnPoint), expectedId, 'spawnPoint must be spawnable');

  const reachable = getReachablePositions(data, data.spawnPoint);
  let spawnableCount = 0;
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const position = { x, y };
      if (isSpawnableTile(data, position)) spawnableCount++;
      if (isWalkableTile(data, position)) {
        assert(reachable.has(`${x},${y}`), expectedId, `walkable tile ${x},${y} is unreachable from spawn`);
      }
    }
  }
  assert(spawnableCount > 0, expectedId, 'at least one spawnable tile is required');

  // NPC（只有城鎮地圖會有）：站在可通行格上，且必須走得到
  if (data.npcs !== undefined) {
    assert(Array.isArray(data.npcs), expectedId, 'npcs must be an array');
    const seen = new Set<string>();
    for (const npc of data.npcs) {
      const at = `${npc?.x},${npc?.y}`;
      assert(typeof npc?.facility === 'string' && npc.facility.length > 0, expectedId, `npc at ${at} needs a facility id`);
      assert(typeof npc?.name === 'string' && npc.name.length > 0, expectedId, `npc "${npc?.facility}" needs a name`);
      assert(typeof npc?.icon === 'string' && npc.icon.length > 0, expectedId, `npc "${npc?.facility}" needs an icon`);
      assert(isInBounds(data, npc), expectedId, `npc "${npc.facility}" is outside map bounds`);
      // NPC 有實體：自己站的格子不可通行（尋路要繞過他），
      // 但必須至少有一個走得到的相鄰格。
      assert(!isWalkableTile(data, npc), expectedId, `npc "${npc.facility}" must stand on a blocking tile`);
      const hasApproach = CARDINAL_AND_DIAGONAL.some(offset => {
        const neighbour = { x: npc.x + offset.x, y: npc.y + offset.y };
        return isInBounds(data, neighbour)
          && isWalkableTile(data, neighbour)
          && reachable.has(`${neighbour.x},${neighbour.y}`);
      });
      assert(hasApproach, expectedId, `npc "${npc.facility}" at ${at} has no reachable adjacent tile`);
      assert(!seen.has(at), expectedId, `two npcs share tile ${at}`);
      seen.add(at);
    }
  }

  return data;
}

const CARDINAL_AND_DIAGONAL: readonly Position[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

function getReachablePositions(map: MapData, start: Position): Set<string> {
  const visited = new Set<string>([`${start.x},${start.y}`]);
  const queue = [start];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const direction of CARDINAL_AND_DIAGONAL) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (visited.has(key) || !canTransition(map, current, next)) continue;
      if (direction.x !== 0 && direction.y !== 0) {
        const horizontal = { x: current.x + direction.x, y: current.y };
        const vertical = { x: current.x, y: current.y + direction.y };
        if (!canTransition(map, current, horizontal) || !canTransition(map, current, vertical)
          || !canTransition(map, horizontal, next) || !canTransition(map, vertical, next)) continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }
  return visited;
}

async function loadMap(id: string): Promise<MapData | null> {
  if (mapCache.has(id)) return mapCache.get(id)!;
  const key = getMapKey(id);
  if (!key) return null;
  const data = await mapModules[key]() as MapData;
  const validated = validateMapData(data, id);
  mapCache.set(id, validated);
  return validated;
}

export async function getMapForRegion(regionId: string, floor?: number | null): Promise<MapData | null> {
  const requestedId = floor != null ? `${regionId}-${floor}f` : regionId;
  const exact = await loadMap(requestedId);
  if (exact) return exact;
  if (floor != null) return loadMap(regionId);
  return null;
}

export async function loadAllMaps(): Promise<MapData[]> {
  const ids = Object.keys(mapModules).map(path => path.slice(path.lastIndexOf('/') + 1, -5)).sort();
  return Promise.all(ids.map(async id => {
    const map = await loadMap(id);
    if (!map) throw new Error(`Map module disappeared: ${id}`);
    return map;
  }));
}

export function clearMapCache(): void {
  mapCache.clear();
}
