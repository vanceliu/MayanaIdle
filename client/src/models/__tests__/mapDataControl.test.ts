import { describe, it, expect, beforeEach } from 'vitest';
import { getMapForRegion, clearMapCache, loadAllMaps } from '../../models/mapDataControl';
import { TileType, getTileDefinition, isSpawnableTile, isWalkableTile } from '../../models/mapControl';

beforeEach(() => {
  clearMapCache();
});

describe('mapDataControl - map integrity', () => {
  it('dawn plains has correct dimensions', async () => {
    const map = await getMapForRegion('dawn-plains');
    expect(map).not.toBeNull();
    expect(map!.width).toBe(20);
    expect(map!.height).toBe(15);
    expect(map!.tiles.length).toBe(15);
    expect(map!.tiles[0].length).toBe(20);
  });

  it('ivory tower 1F has correct dimensions', async () => {
    const map = await getMapForRegion('ivory-tower', 1);
    expect(map).not.toBeNull();
    expect(map!.width).toBe(30);
    expect(map!.height).toBe(20);
    expect(map!.tiles.length).toBe(20);
    expect(map!.tiles[0].length).toBe(30);
  });

  it('tile catalog uses distinct IDs for boundary and structures', () => {
    const ids = Object.values(TileType);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TileType.Boundary).not.toBe(TileType.Wall);
    expect(TileType.Tree).not.toBe(TileType.Rock);
  });

  it('spawn points are on walkable tiles', async () => {
    const prairie = await getMapForRegion('dawn-plains');
    expect(prairie).not.toBeNull();
    const sp1 = prairie!.spawnPoint;
    expect(prairie!.tiles[sp1.y][sp1.x]).not.toBe(TileType.Boundary);

    const tower = await getMapForRegion('ivory-tower', 1);
    expect(tower).not.toBeNull();
    const sp2 = tower!.spawnPoint;
    expect(tower!.tiles[sp2.y][sp2.x]).not.toBe(TileType.Boundary);
  });

  it('maps are bordered by explicit boundaries', async () => {
    const prairie = await getMapForRegion('dawn-plains');
    expect(prairie).not.toBeNull();
    for (let x = 0; x < prairie!.width; x++) {
      expect(prairie!.tiles[0][x]).toBe(TileType.Boundary);
      expect(prairie!.tiles[prairie!.height - 1][x]).toBe(TileType.Boundary);
    }
    for (let y = 0; y < prairie!.height; y++) {
      expect(prairie!.tiles[y][0]).toBe(TileType.Boundary);
      expect(prairie!.tiles[y][prairie!.width - 1]).toBe(TileType.Boundary);
    }
  });

  it('ivory tower has more walls than dawn plains (maze vs open)', async () => {
    const prairie = await getMapForRegion('dawn-plains');
    const tower = await getMapForRegion('ivory-tower', 1);
    expect(prairie).not.toBeNull();
    expect(tower).not.toBeNull();

    const countWalls = (tiles: number[][]) =>
      tiles.flat().filter(t => t === TileType.Wall || t === TileType.Pillar).length;
    expect(countWalls(tower!.tiles)).toBeGreaterThan(
      countWalls(prairie!.tiles)
    );
  });
});

describe('mapDataControl - getMapForRegion', () => {
  it('returns matching map by region id', async () => {
    const map = await getMapForRegion('dawn-plains');
    expect(map).not.toBeNull();
    expect(map!.id).toBe('dawn-plains');
  });

  it('returns matching map by region + floor', async () => {
    const map = await getMapForRegion('ivory-tower', 1);
    expect(map).not.toBeNull();
    expect(map!.id).toBe('ivory-tower-1f');
  });

  it('returns null for an unknown region instead of hiding missing data', async () => {
    await expect(getMapForRegion('unknown-region')).resolves.toBeNull();
  });

  it('validates every static JSON map and preserves its declared dimensions', async () => {
    const maps = await loadAllMaps();
    expect(maps).toHaveLength(50);
    expect(new Set(maps.map(map => map.id)).size).toBe(maps.length);
    for (const map of maps) {
      expect(map.tiles).toHaveLength(map.height);
      expect(map.tiles.every(row => row.length === map.width)).toBe(true);
      expect(map.tiles.flat().every(tile => getTileDefinition(tile) !== undefined)).toBe(true);
      expect(isWalkableTile(map, map.spawnPoint)).toBe(true);
      expect(isSpawnableTile(map, map.spawnPoint)).toBe(true);
      expect(map.tiles.flat().some((_, index) => isSpawnableTile(map, { x: index % map.width, y: Math.floor(index / map.width) }))).toBe(true);
    }
  });

  it('showcase maps contain obstacles and decoration', async () => {
    for (const map of [await getMapForRegion('dawn-plains'), await getMapForRegion('ivory-tower', 1)]) {
      expect(map).not.toBeNull();
      const tiles = new Set(map!.tiles.flat());
      expect([TileType.Wall, TileType.Tree, TileType.Rock, TileType.Pillar].some(tile => tiles.has(tile))).toBe(true);
      expect(tiles.has(TileType.Decoration)).toBe(true);
    }
  });

  it('caches maps after first load', async () => {
    const map1 = await getMapForRegion('dawn-plains');
    const map2 = await getMapForRegion('dawn-plains');
    expect(map1).toBe(map2);
  });
});
