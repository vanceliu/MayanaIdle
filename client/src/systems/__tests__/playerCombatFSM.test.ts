import { describe, it, expect } from 'vitest';
import {
  createPlayerCombatContext,
  tickPlayerCombat,
  getWeaponAttackConfig,
} from '../playerCombatFSM';
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

const openMap = createMap([
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
]);

describe('getWeaponAttackConfig', () => {
  it('bow is ranged 15', () => {
    const config = getWeaponAttackConfig('bow');
    expect(config.attackType).toBe('ranged');
    expect(config.range).toBe(15);
  });

  it('staff is melee 1.5', () => {
    const config = getWeaponAttackConfig('staff');
    expect(config.attackType).toBe('melee');
    expect(config.range).toBe(1.5);
  });

  it('sword is melee 1.5', () => {
    const config = getWeaponAttackConfig('onesword');
    expect(config.attackType).toBe('melee');
    expect(config.range).toBe(1.5);
  });

  it('undefined weapon is melee 1.5', () => {
    const config = getWeaponAttackConfig(undefined);
    expect(config.attackType).toBe('melee');
    expect(config.range).toBe(1.5);
  });
});

describe('tickPlayerCombat', () => {
  it('returns idle when no monsters', () => {
    const ctx = createPlayerCombatContext();
    const result = tickPlayerCombat(ctx, { x: 2, y: 2 }, [], { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(result.action).toBe('none');
    expect(ctx.state).toBe('idle');
  });

  it('selects nearest monster as target', () => {
    const ctx = createPlayerCombatContext();
    const monsters = [
      { id: 'm0', index: 0, position: { x: 4, y: 4 }, alive: true },
      { id: 'm1', index: 1, position: { x: 2, y: 3 }, alive: true },
    ];
    tickPlayerCombat(ctx, { x: 2, y: 2 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(ctx.targetMonsterId).toBe('m1');
  });

  it('returns move_to when target out of range', () => {
    const ctx = createPlayerCombatContext();
    const monsters = [{ id: 'm0', index: 0, position: { x: 4, y: 4 }, alive: true }];
    const result = tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(result.action).toBe('move_to');
    expect(ctx.state).toBe('chasing');
  });

  it('enters attacking state when in range', () => {
    const ctx = createPlayerCombatContext();
    const monsters = [{ id: 'm0', index: 0, position: { x: 1, y: 0 }, alive: true }];
    const result = tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(result.action).toBe('none');
    expect(ctx.state).toBe('attacking');
  });

  it('fires attack after cooldown', () => {
    const ctx = createPlayerCombatContext();
    ctx.attackCooldown = 100;
    const monsters = [{ id: 'm0', index: 0, position: { x: 1, y: 0 }, alive: true }];

    tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 50);
    expect(ctx.state).toBe('attacking');
    expect(ctx.attackTimer).toBe(50);

    const result = tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 60);
    expect(result.action).toBe('attack');
    expect(ctx.attackTimer).toBe(0);
  });

  it('switches target when current dies', () => {
    const ctx = createPlayerCombatContext();
    ctx.targetMonsterId = 'm0';
    const monsters = [
      { id: 'm0', index: 0, position: { x: 1, y: 0 }, alive: false },
      { id: 'm1', index: 1, position: { x: 2, y: 0 }, alive: true },
    ];
    tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(ctx.targetMonsterId).toBe('m1');
  });

  it('ranged weapon attacks from distance', () => {
    const bigMap = createMap(Array.from({ length: 20 }, () => Array(20).fill(0)));
    const ctx = createPlayerCombatContext();
    ctx.attackCooldown = 100;
    const monsters = [{ id: 'm0', index: 0, position: { x: 10, y: 0 }, alive: true }];
    tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'ranged', range: 20 }, bigMap, 50);
    expect(ctx.state).toBe('attacking');
  });
});
