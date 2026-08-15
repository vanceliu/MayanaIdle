import { describe, it, expect } from 'vitest';
import { createPlayerCombatContext, tickPlayerCombat } from '../playerCombatFSM';
import type { AttackConfig, MonsterInfo } from '../playerCombatFSM';
import { findAttackPosition, isAttackPosition } from '../pathfinding';
import type { MapData, Position } from '../../models/mapControl';

const openMap: MapData = {
  id: 'open',
  name: 'Open',
  width: 40,
  height: 10,
  spawnPoint: { x: 0, y: 0 },
  tiles: Array(10).fill(null).map(() => Array(40).fill(0)),
};

const target = { x: 30, y: 5 };
const monsters: MonsterInfo[] = [{ id: 'm1', index: 0, position: target, alive: true }];
const playerPos = { x: 5, y: 5 };

const skillReady: AttackConfig = { attackType: 'ranged', range: 12, chaseRange: 12 };
const skillOnCooldown: AttackConfig = { attackType: 'melee', range: 1.5, chaseRange: 12 };

function needsRepath(dest: Position | undefined, isMoving: boolean, range: number): boolean {
  return !(isMoving && dest && isAttackPosition(openMap, dest, target, range));
}

function chase(config: AttackConfig) {
  return tickPlayerCombat(
    createPlayerCombatContext(), playerPos, monsters, config, openMap, 16, false, true,
  );
}

describe('技能冷卻會讓落腳格逐幀跳動', () => {
  it('選中技能走到 12，選中普攻走到 1.5', () => {
    expect(chase(skillReady).moveRange).toBe(12);
    expect(chase(skillOnCooldown).moveRange).toBe(1.5);
  });

  it('兩種射程算出的落腳格不同', () => {
    const far = findAttackPosition(openMap, target, playerPos, chase(skillReady).moveRange!)!;
    const near = findAttackPosition(openMap, target, playerPos, chase(skillOnCooldown).moveRange!)!;
    expect(far).not.toEqual(near);
  });

  it('沿用現有目的地可吸收跳動：貼身的目的地對兩種射程都成立', () => {
    const near = findAttackPosition(openMap, target, playerPos, 1.5)!;
    expect(needsRepath(near, true, 1.5)).toBe(false);
    expect(needsRepath(near, true, 12)).toBe(false);
  });

  it('遠的目的地在射程縮回武器值時失效，重選一次後即穩定', () => {
    const far = findAttackPosition(openMap, target, playerPos, 12)!;
    expect(needsRepath(far, true, 12)).toBe(false);
    expect(needsRepath(far, true, 1.5)).toBe(true);
  });
});

describe('追擊途中的重選判定', () => {
  it('目的地打不到目標時才重選', () => {
    expect(needsRepath(playerPos, true, 12)).toBe(true);
  });

  it('尚未移動時一律重選', () => {
    const dest = findAttackPosition(openMap, target, playerPos, 12)!;
    expect(needsRepath(dest, false, 12)).toBe(true);
  });

  it('目的地被佔位時視為失效', () => {
    const dest = findAttackPosition(openMap, target, playerPos, 12)!;
    const occupied = new Set([`${dest.x},${dest.y}`]);
    expect(isAttackPosition(openMap, dest, target, 12, occupied)).toBe(false);
  });
});
