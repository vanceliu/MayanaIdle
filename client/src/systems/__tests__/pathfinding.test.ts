import { describe, it, expect } from 'vitest';
import { findAttackPosition, findPath, findNearestWalkable, getRandomWalkablePosition } from '../../systems/pathfinding';
import { TileType } from '../../models/mapControl';
import type { MapData } from '../../models/mapControl';

const simpleMap: MapData = {
  id: 'test',
  name: 'Test Map',
  width: 5,
  height: 5,
  spawnPoint: { x: 0, y: 0 },
  tiles: [
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 1, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
};

const blockedMap: MapData = {
  id: 'blocked',
  name: 'Blocked',
  width: 3,
  height: 3,
  spawnPoint: { x: 0, y: 0 },
  tiles: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
};

describe('pathfinding - findPath', () => {
  it('finds straight path with no obstacles', () => {
    const openMap: MapData = {
      id: 'open',
      name: 'Open',
      width: 5,
      height: 5,
      spawnPoint: { x: 0, y: 0 },
      tiles: Array(5).fill(null).map(() => Array(5).fill(0)),
    };
    const path = findPath(openMap, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(4);
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 0 });
  });

  it('finds path around walls', () => {
    const path = findPath(simpleMap, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 0 });
  });

  it('returns null when target is a wall', () => {
    const path = findPath(simpleMap, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(path).toBeNull();
  });

  it('returns null when no path exists', () => {
    const path = findPath(blockedMap, { x: 0, y: 0 }, { x: 2, y: 2 });
    expect(path).toBeNull();
  });

  it('returns empty array when start equals end', () => {
    const path = findPath(simpleMap, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(path).toEqual([]);
  });

  it('path does not pass through walls', () => {
    const path = findPath(simpleMap, { x: 0, y: 0 }, { x: 4, y: 4 });
    expect(path).not.toBeNull();
    for (const p of path!) {
      expect(simpleMap.tiles[p.y][p.x]).not.toBe(TileType.Wall);
    }
  });

  it('does not cut diagonally across walls', () => {
    const map: MapData = {
      id: 'corner', name: 'Corner', width: 3, height: 3,
      spawnPoint: { x: 0, y: 0 },
      tiles: [[0, 0, 0], [0, 1, 0], [0, 0, 0]],
    };
    expect(findPath(map, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe('pathfinding - findAttackPosition', () => {
  it('finds attack position around walls', () => {
    const result = findAttackPosition(simpleMap, { x: 0, y: 0 }, { x: 4, y: 4 }, 2);
    expect(result).not.toBeNull();
    if (result) {
      expect(simpleMap.tiles[result.y][result.x]).not.toBe(TileType.Wall);
    }
  });

  it('honors occupied attack positions', () => {
    const occupied = new Set(['0,1', '1,0']);
    const result = findAttackPosition(simpleMap, { x: 0, y: 0 }, { x: 2, y: 0 }, 1.5, occupied);
    expect(result).not.toEqual({ x: 0, y: 1 });
    expect(result).not.toEqual({ x: 1, y: 0 });
  });
});

describe('pathfinding - findNearestWalkable', () => {
  it('returns same position if already walkable', () => {
    const result = findNearestWalkable(simpleMap, { x: 0, y: 0 });
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('finds nearest walkable to a wall tile', () => {
    const result = findNearestWalkable(simpleMap, { x: 1, y: 1 });
    expect(result).not.toBeNull();
    expect(simpleMap.tiles[result!.y][result!.x]).not.toBe(TileType.Wall);
  });

  it('returns adjacent tile for wall position', () => {
    const result = findNearestWalkable(simpleMap, { x: 2, y: 1 });
    expect(result).not.toBeNull();
    const dist = Math.abs(result!.x - 2) + Math.abs(result!.y - 1);
    expect(dist).toBe(1);
  });
});

describe('pathfinding - getRandomWalkablePosition', () => {
  it('returns a walkable position', () => {
    const pos = getRandomWalkablePosition(simpleMap);
    expect(simpleMap.tiles[pos.y][pos.x]).not.toBe(TileType.Wall);
  });

  it('excludes specified position', () => {
    const exclude = { x: 0, y: 0 };
    for (let i = 0; i < 20; i++) {
      const pos = getRandomWalkablePosition(simpleMap, exclude);
      expect(pos.x !== 0 || pos.y !== 0).toBe(true);
    }
  });
});
