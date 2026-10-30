/**
 * 突進位移（`41-arpg-combat.md` § 3.6）。
 */
import { describe, it, expect } from 'vitest';
import { planDash, isStraightPathWalkable } from '../dash';
import { TileType } from '../../models/mapControl';
import type { MapData } from '../../models/mapControl';

const G = TileType.Ground;
const W = TileType.Wall;
const A = TileType.Water;

function makeMap(rows: number[][]): MapData {
  return { id: 'dash', name: 'Dash', width: rows[0].length, height: rows.length, spawnPoint: { x: 0, y: 0 }, tiles: rows };
}

const open = makeMap(Array.from({ length: 5 }, () => Array(10).fill(G)));

describe('planDash', () => {
  it('落點為目標相鄰格中離自身最近的一格', () => {
    expect(planDash(open, { x: 0, y: 2 }, { x: 6, y: 2 }, 8)).toEqual({ landing: { x: 5, y: 2 }, moves: true });
  });

  it('目標已在相鄰格：不移動', () => {
    expect(planDash(open, { x: 4, y: 2 }, { x: 5, y: 3 }, 8)).toEqual({ landing: { x: 4, y: 2 }, moves: false });
  });

  it('超出射程不可施放', () => {
    expect(planDash(open, { x: 0, y: 2 }, { x: 9, y: 2 }, 8)).toBeNull();
  });

  it('被佔用的格子不當落點，改取次近的', () => {
    const plan = planDash(open, { x: 0, y: 2 }, { x: 6, y: 2 }, 8, new Set(['5,2']));
    expect(plan?.moves).toBe(true);
    expect(plan?.landing).not.toEqual({ x: 5, y: 2 });
    expect(Math.abs(plan!.landing.x - 6)).toBeLessThanOrEqual(1);
  });

  it('沒有視線（牆）不可施放', () => {
    const map = makeMap([
      [G, G, G, W, G, G, G],
      [G, G, G, W, G, G, G],
      [G, G, G, W, G, G, G],
    ]);
    expect(planDash(map, { x: 0, y: 1 }, { x: 6, y: 1 }, 8)).toBeNull();
  });

  it('中間隔著水池（有視線、走不過去）不可施放', () => {
    const map = makeMap([
      [G, G, G, A, G, G, G],
      [G, G, G, A, G, G, G],
      [G, G, G, A, G, G, G],
    ]);
    expect(planDash(map, { x: 0, y: 1 }, { x: 6, y: 1 }, 8)).toBeNull();
  });
});

describe('isStraightPathWalkable', () => {
  it('斜線不可切過障礙的角', () => {
    const map = makeMap([
      [G, W],
      [G, G],
    ]);
    expect(isStraightPathWalkable(map, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  it('同一格視為可通行', () => {
    expect(isStraightPathWalkable(open, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(true);
  });
});
