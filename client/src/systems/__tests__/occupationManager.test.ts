import { describe, it, expect } from 'vitest';
import { OccupationManager } from '../occupationManager';

describe('OccupationManager', () => {
  it('starts empty', () => {
    const mgr = new OccupationManager();
    expect(mgr.isOccupied({ x: 0, y: 0 })).toBe(false);
  });

  it('registers and queries occupant', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 3, y: 4 }, 'player', 'player');
    expect(mgr.isOccupied({ x: 3, y: 4 })).toBe(true);
    expect(mgr.getOccupant({ x: 3, y: 4 })).toEqual({ type: 'player', id: 'player' });
  });

  it('unregisters occupant', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 1, y: 1 }, 'monster', 'm1');
    mgr.unregister({ x: 1, y: 1 });
    expect(mgr.isOccupied({ x: 1, y: 1 })).toBe(false);
  });

  it('isOccupiedByType checks type correctly', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 2, y: 2 }, 'monster', 'm1');
    expect(mgr.isOccupiedByType({ x: 2, y: 2 }, 'monster')).toBe(true);
    expect(mgr.isOccupiedByType({ x: 2, y: 2 }, 'player')).toBe(false);
  });

  it('canMoveTo returns true for empty tile', () => {
    const mgr = new OccupationManager();
    expect(mgr.canMoveTo({ x: 5, y: 5 }, 'entity1')).toBe(true);
  });

  it('canMoveTo returns true for own tile', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 3, y: 3 }, 'monster', 'm1');
    expect(mgr.canMoveTo({ x: 3, y: 3 }, 'm1')).toBe(true);
  });

  it('canMoveTo returns false for occupied tile', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 3, y: 3 }, 'monster', 'm1');
    expect(mgr.canMoveTo({ x: 3, y: 3 }, 'm2')).toBe(false);
  });

  it('move succeeds to empty tile', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 1, y: 1 }, 'player', 'player');
    const success = mgr.move({ x: 1, y: 1 }, { x: 2, y: 2 }, 'player', 'player');
    expect(success).toBe(true);
    expect(mgr.isOccupied({ x: 1, y: 1 })).toBe(false);
    expect(mgr.isOccupied({ x: 2, y: 2 })).toBe(true);
  });

  it('move fails to occupied tile', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 1, y: 1 }, 'player', 'player');
    mgr.register({ x: 2, y: 2 }, 'monster', 'm1');
    const success = mgr.move({ x: 1, y: 1 }, { x: 2, y: 2 }, 'player', 'player');
    expect(success).toBe(false);
    expect(mgr.isOccupied({ x: 1, y: 1 })).toBe(true);
  });

  it('clear removes all occupants', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 1, y: 1 }, 'player', 'player');
    mgr.register({ x: 2, y: 2 }, 'monster', 'm1');
    mgr.clear();
    expect(mgr.isOccupied({ x: 1, y: 1 })).toBe(false);
    expect(mgr.isOccupied({ x: 2, y: 2 })).toBe(false);
  });

  it('getOccupiedSet returns all keys except excluded', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 1, y: 1 }, 'player', 'player');
    mgr.register({ x: 2, y: 2 }, 'monster', 'm1');
    mgr.register({ x: 3, y: 3 }, 'monster', 'm2');

    const all = mgr.getOccupiedSet();
    expect(all.size).toBe(3);

    const excludeM1 = mgr.getOccupiedSet('m1');
    expect(excludeM1.size).toBe(2);
    expect(excludeM1.has('2,2')).toBe(false);
  });

  it('rounds fractional positions', () => {
    const mgr = new OccupationManager();
    mgr.register({ x: 1.4, y: 2.6 }, 'monster', 'm1');
    expect(mgr.isOccupied({ x: 1, y: 3 })).toBe(true);
    expect(mgr.isOccupied({ x: 1.4, y: 2.6 })).toBe(true);
  });
});
