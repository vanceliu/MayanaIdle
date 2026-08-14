import { describe, it, expect } from 'vitest';
import {
  createMonsterCombatContext,
  tickMonsterCombat,
  DEFAULT_MONSTER_ATTACK_CONFIG,
} from '../monsterCombatFSM';
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
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
]);

describe('monsterCombatFSM', () => {
  it('starts in roaming state', () => {
    const ctx = createMonsterCombatContext();
    expect(ctx.state).toBe('roaming');
  });

  it('stays roaming when player is far', () => {
    const ctx = createMonsterCombatContext();
    const result = tickMonsterCombat(ctx, { x: 0, y: 0 }, { x: 15, y: 0 }, DEFAULT_MONSTER_ATTACK_CONFIG, openMap, 16);
    expect(result.action).toBe('none');
    expect(ctx.state).toBe('roaming');
  });

  it('transitions to chasing when player in aggro range', () => {
    const ctx = createMonsterCombatContext();
    const result = tickMonsterCombat(ctx, { x: 0, y: 0 }, { x: 5, y: 0 }, DEFAULT_MONSTER_ATTACK_CONFIG, openMap, 16);
    expect(result.action).toBe('chase');
    expect(ctx.state).toBe('chasing');
  });

  it('transitions to attacking when in attack range', () => {
    const ctx = createMonsterCombatContext();
    ctx.state = 'chasing';
    const result = tickMonsterCombat(ctx, { x: 0, y: 0 }, { x: 1, y: 0 }, DEFAULT_MONSTER_ATTACK_CONFIG, openMap, 16);
    expect(result.action).toBe('none');
    expect(ctx.state).toBe('attacking');
  });

  it('attacks after cooldown', () => {
    const ctx = createMonsterCombatContext();
    ctx.state = 'attacking';
    ctx.attackTimer = 0;
    const config = { ...DEFAULT_MONSTER_ATTACK_CONFIG, attackInterval: 100 };
    // rng 回 1 → 必定走瞬發那條（§ 25.11 的詠唱有 CAST_CHANCE 機率，不注入會隨機變 casting）
    const noCast = () => 1;

    // First tick: timer accumulates
    tickMonsterCombat(ctx, { x: 0, y: 0 }, { x: 1, y: 0 }, config, openMap, 50, false, noCast);
    expect(ctx.attackTimer).toBe(50);

    // Second tick: timer exceeds interval
    const result = tickMonsterCombat(ctx, { x: 0, y: 0 }, { x: 1, y: 0 }, config, openMap, 60, false, noCast);
    expect(result.action).toBe('attack');
    expect(ctx.attackTimer).toBe(0);
  });

  it('returns to chasing when player moves out of range', () => {
    const ctx = createMonsterCombatContext();
    ctx.state = 'attacking';
    const result = tickMonsterCombat(ctx, { x: 0, y: 0 }, { x: 5, y: 0 }, DEFAULT_MONSTER_ATTACK_CONFIG, openMap, 16);
    expect(result.action).toBe('chase');
    expect(ctx.state).toBe('chasing');
  });

  it('leashes when player too far', () => {
    const ctx = createMonsterCombatContext();
    ctx.state = 'chasing';
    const result = tickMonsterCombat(ctx, { x: 0, y: 0 }, { x: 19, y: 0 }, DEFAULT_MONSTER_ATTACK_CONFIG, openMap, 16);
    expect(result.action).toBe('leash');
    expect(ctx.state).toBe('roaming');
  });

  it('does nothing when stunned', () => {
    const ctx = createMonsterCombatContext();
    ctx.state = 'attacking';
    ctx.attackTimer = 5000;
    const result = tickMonsterCombat(ctx, { x: 0, y: 0 }, { x: 1, y: 0 }, DEFAULT_MONSTER_ATTACK_CONFIG, openMap, 16, true);
    expect(result.action).toBe('none');
  });
});
