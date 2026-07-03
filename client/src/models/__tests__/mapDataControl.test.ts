import { describe, it, expect, beforeEach } from 'vitest';
import { getMapForRegion, clearMapCache } from '../../models/mapDataControl';
import { TileType } from '../../models/mapControl';

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
    expect(map!.width).toBe(40);
    expect(map!.height).toBe(30);
    expect(map!.tiles.length).toBe(30);
    expect(map!.tiles[0].length).toBe(40);
  });

  it('spawn points are on walkable tiles', async () => {
    const prairie = await getMapForRegion('dawn-plains');
    expect(prairie).not.toBeNull();
    const sp1 = prairie!.spawnPoint;
    expect(prairie!.tiles[sp1.y][sp1.x]).not.toBe(TileType.Wall);

    const tower = await getMapForRegion('ivory-tower', 1);
    expect(tower).not.toBeNull();
    const sp2 = tower!.spawnPoint;
    expect(tower!.tiles[sp2.y][sp2.x]).not.toBe(TileType.Wall);
  });

  it('maps are bordered by walls', async () => {
    const prairie = await getMapForRegion('dawn-plains');
    expect(prairie).not.toBeNull();
    for (let x = 0; x < prairie!.width; x++) {
      expect(prairie!.tiles[0][x]).toBe(TileType.Wall);
      expect(prairie!.tiles[prairie!.height - 1][x]).toBe(TileType.Wall);
    }
    for (let y = 0; y < prairie!.height; y++) {
      expect(prairie!.tiles[y][0]).toBe(TileType.Wall);
      expect(prairie!.tiles[y][prairie!.width - 1]).toBe(TileType.Wall);
    }
  });

  it('ivory tower has more walls than dawn plains (maze vs open)', async () => {
    const prairie = await getMapForRegion('dawn-plains');
    const tower = await getMapForRegion('ivory-tower', 1);
    expect(prairie).not.toBeNull();
    expect(tower).not.toBeNull();

    const countWalls = (tiles: number[][]) =>
      tiles.flat().filter(t => t === TileType.Wall).length;
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

  it('falls back to dawn plains for unknown region', async () => {
    const map = await getMapForRegion('unknown-region');
    expect(map).not.toBeNull();
    expect(map!.id).toBe('dawn-plains');
  });

  it('caches maps after first load', async () => {
    const map1 = await getMapForRegion('dawn-plains');
    const map2 = await getMapForRegion('dawn-plains');
    expect(map1).toBe(map2);
  });
});
