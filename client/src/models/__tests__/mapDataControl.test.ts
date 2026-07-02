import { describe, it, expect } from 'vitest';
import { MAP_DAWN_PRAIRIE, MAP_IVORY_TOWER_1F, getMapForRegion } from '../../models/mapDataControl';
import { TileType } from '../../models/mapControl';

describe('mapDataControl - map integrity', () => {
  it('dawn prairie has correct dimensions', () => {
    expect(MAP_DAWN_PRAIRIE.width).toBe(20);
    expect(MAP_DAWN_PRAIRIE.height).toBe(15);
    expect(MAP_DAWN_PRAIRIE.tiles.length).toBe(15);
    expect(MAP_DAWN_PRAIRIE.tiles[0].length).toBe(20);
  });

  it('ivory tower 1F has correct dimensions', () => {
    expect(MAP_IVORY_TOWER_1F.width).toBe(20);
    expect(MAP_IVORY_TOWER_1F.height).toBe(15);
    expect(MAP_IVORY_TOWER_1F.tiles.length).toBe(15);
    expect(MAP_IVORY_TOWER_1F.tiles[0].length).toBe(20);
  });

  it('spawn points are on walkable tiles', () => {
    const sp1 = MAP_DAWN_PRAIRIE.spawnPoint;
    expect(MAP_DAWN_PRAIRIE.tiles[sp1.y][sp1.x]).not.toBe(TileType.Wall);

    const sp2 = MAP_IVORY_TOWER_1F.spawnPoint;
    expect(MAP_IVORY_TOWER_1F.tiles[sp2.y][sp2.x]).not.toBe(TileType.Wall);
  });

  it('maps are bordered by walls', () => {
    for (let x = 0; x < 20; x++) {
      expect(MAP_DAWN_PRAIRIE.tiles[0][x]).toBe(TileType.Wall);
      expect(MAP_DAWN_PRAIRIE.tiles[14][x]).toBe(TileType.Wall);
    }
    for (let y = 0; y < 15; y++) {
      expect(MAP_DAWN_PRAIRIE.tiles[y][0]).toBe(TileType.Wall);
      expect(MAP_DAWN_PRAIRIE.tiles[y][19]).toBe(TileType.Wall);
    }
  });

  it('ivory tower has more walls than dawn prairie (maze vs open)', () => {
    const countWalls = (tiles: number[][]) =>
      tiles.flat().filter(t => t === TileType.Wall).length;
    expect(countWalls(MAP_IVORY_TOWER_1F.tiles)).toBeGreaterThan(
      countWalls(MAP_DAWN_PRAIRIE.tiles)
    );
  });
});

describe('mapDataControl - getMapForRegion', () => {
  it('returns matching map by region id', () => {
    const map = getMapForRegion('dawn-prairie');
    expect(map).not.toBeNull();
    expect(map!.id).toBe('dawn-prairie');
  });

  it('returns matching map by region + floor', () => {
    const map = getMapForRegion('ivory-tower', 1);
    expect(map).not.toBeNull();
    expect(map!.id).toBe('ivory-tower-1f');
  });

  it('falls back to dawn prairie for unknown region', () => {
    const map = getMapForRegion('unknown-region');
    expect(map).not.toBeNull();
    expect(map!.id).toBe('dawn-prairie');
  });
});
