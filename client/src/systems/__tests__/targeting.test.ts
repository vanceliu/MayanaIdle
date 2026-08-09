import { describe, it, expect } from 'vitest';
import { resolveActionTargets, resolvePrimaryTarget, type TargetCandidate } from '../targeting';
import type { Skill } from '../../models/skill';

const PLAYER = { x: 0, y: 0 };

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'fireball',
    name: '火球',
    level: 3,
    element: 'fire',
    type: 'attack',
    target: 'aoe',
    power: 25,
    mpCost: 15,
    cooldown: 6000,
    range: 12,
    aoeCenter: 'target',
    aoeRadius: 3,
    maxTargets: 3,
    lastUsedAt: 0,
    ...overrides,
  };
}

const SINGLE = skill({ id: 'wind-blade', name: '風刃', target: 'single', aoeCenter: undefined, aoeRadius: undefined, maxTargets: undefined });
const SELF_AOE = skill({ id: 'divine-thunder', name: '天雷', aoeCenter: 'self', aoeRadius: 5, maxTargets: undefined });

function at(id: string, x: number, y = 0): TargetCandidate {
  return { id, position: { x, y } };
}

describe('resolvePrimaryTarget', () => {
  it('returns null when there is nothing to hit', () => {
    expect(resolvePrimaryTarget([], PLAYER, null)).toBeNull();
  });

  it('keeps the FSM-selected target when it is still in the candidate list', () => {
    const candidates = [at('a', 1), at('b', 10)];
    expect(resolvePrimaryTarget(candidates, PLAYER, 'b')).toBe('b');
  });

  it('falls back to the nearest when the selected target is gone (dead/despawned)', () => {
    const candidates = [at('a', 5), at('b', 2)];
    expect(resolvePrimaryTarget(candidates, PLAYER, 'ghost')).toBe('b');
  });
});

describe('resolveActionTargets', () => {
  it('returns nothing when the primary target is out of the action range', () => {
    const targets = resolveActionTargets({
      candidates: [at('a', 20)],
      playerPos: PLAYER,
      primaryTargetId: null,
      action: { type: 'normal_attack' },
      skills: [],
      maxRange: 1.5,
    });
    expect(targets).toEqual([]);
  });

  it('hits only the primary target with a normal attack', () => {
    const targets = resolveActionTargets({
      candidates: [at('a', 1), at('b', 1.2)],
      playerPos: PLAYER,
      primaryTargetId: 'a',
      action: { type: 'normal_attack' },
      skills: [],
      maxRange: 1.5,
    });
    expect(targets).toEqual(['a']);
  });

  it('hits only the primary target with a single-target skill', () => {
    const targets = resolveActionTargets({
      candidates: [at('a', 5), at('b', 6)],
      playerPos: PLAYER,
      primaryTargetId: 'a',
      action: { type: 'skill', skillId: 'wind-blade' },
      skills: [SINGLE],
      maxRange: 10,
    });
    expect(targets).toEqual(['a']);
  });

  it('picks up nearby monsters around a target-centered AoE, capped by maxTargets', () => {
    const targets = resolveActionTargets({
      candidates: [at('a', 5), at('b', 6), at('c', 7), at('d', 5, 1)],
      playerPos: PLAYER,
      primaryTargetId: 'a',
      action: { type: 'skill', skillId: 'fireball' },
      skills: [skill()],
      maxRange: 12,
    });
    expect(targets).toHaveLength(3); // maxTargets: 3
    expect(targets[0]).toBe('a');
  });

  it('excludes monsters outside the aoe radius', () => {
    const targets = resolveActionTargets({
      candidates: [at('a', 5), at('b', 11)],
      playerPos: PLAYER,
      primaryTargetId: 'a',
      action: { type: 'skill', skillId: 'fireball' },
      skills: [skill()],
      maxRange: 12,
    });
    expect(targets).toEqual(['a']);
  });

  it('hits everything within radius for a self-centered AoE, ignoring maxTargets', () => {
    const targets = resolveActionTargets({
      candidates: [at('a', 1), at('b', 2), at('c', 3), at('d', 4), at('e', 9)],
      playerPos: PLAYER,
      primaryTargetId: 'a',
      action: { type: 'skill', skillId: 'divine-thunder' },
      skills: [SELF_AOE],
      maxRange: 15,
    });
    expect(targets.sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});
