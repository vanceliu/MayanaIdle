import { describe, it, expect } from 'vitest';
import { hasLineOfSight, getDistance, findTargetsInRadius } from '../lineOfSight';
import type { MapData } from '../../models/mapControl';

function createMap(tiles: number[][]): MapData {
  return {
    id: 'test',
    name: 'Test Map',
    width: tiles[0].length,
    height: tiles.length,
    tiles,
    spawnPoint: { x: 0, y: 0 },
  };
}

describe('getDistance', () => {
  it('returns 0 for same position', () => {
    expect(getDistance({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0);
  });

  it('calculates correct distance', () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('handles fractional positions', () => {
    const d = getDistance({ x: 1.5, y: 2.5 }, { x: 4.5, y: 6.5 });
    expect(d).toBe(5);
  });
});

describe('hasLineOfSight', () => {
  it('returns true for adjacent tiles with no wall', () => {
    const map = createMap([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 2, y: 2 }, map)).toBe(true);
  });

  it('returns false when wall blocks path', () => {
    const map = createMap([
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 2, y: 2 }, map)).toBe(false);
  });

  it('returns true for same position', () => {
    const map = createMap([
      [0, 1],
      [1, 0],
    ]);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 0, y: 0 }, map)).toBe(true);
  });

  it('returns true when wall is not in the path', () => {
    const map = createMap([
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 4, y: 0 }, map)).toBe(true);
  });

  it('returns false when path goes out of bounds', () => {
    const map = createMap([
      [0, 0],
      [0, 0],
    ]);
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 5, y: 5 }, map)).toBe(false);
  });
});

describe('findTargetsInRadius', () => {
  it('returns empty when no candidates in range', () => {
    const result = findTargetsInRadius(
      { x: 0, y: 0 },
      3,
      [{ position: { x: 10, y: 10 }, index: 0 }],
    );
    expect(result).toEqual([]);
  });

  it('returns all candidates within radius', () => {
    const result = findTargetsInRadius(
      { x: 5, y: 5 },
      3,
      [
        { position: { x: 5, y: 6 }, index: 0 },
        { position: { x: 5, y: 7 }, index: 1 },
        { position: { x: 5, y: 9 }, index: 2 },
      ],
    );
    expect(result).toEqual([0, 1]);
  });

  it('respects maxTargets limit', () => {
    const result = findTargetsInRadius(
      { x: 5, y: 5 },
      10,
      [
        { position: { x: 5, y: 6 }, index: 0 },
        { position: { x: 5, y: 7 }, index: 1 },
        { position: { x: 5, y: 8 }, index: 2 },
      ],
      2,
    );
    expect(result).toHaveLength(2);
    expect(result).toEqual([0, 1]);
  });

  it('sorts by distance (closest first)', () => {
    const result = findTargetsInRadius(
      { x: 0, y: 0 },
      10,
      [
        { position: { x: 5, y: 0 }, index: 0 },
        { position: { x: 1, y: 0 }, index: 1 },
        { position: { x: 3, y: 0 }, index: 2 },
      ],
    );
    expect(result).toEqual([1, 2, 0]);
  });
});
