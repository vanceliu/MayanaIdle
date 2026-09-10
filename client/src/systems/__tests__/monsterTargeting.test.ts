import { describe, it, expect } from 'vitest';
import {
  createMonsterTargetState, recordMonsterDamage, resolveMonsterTarget, recentDamage,
  TARGET_DECISION_INTERVAL_MS, DAMAGE_WINDOW_MS, type MemberCandidate,
} from '../monsterTargeting';

/** `97-selfhosted-server.md` § 97.7.1「怪物目標」 */
const monsterPos = { x: 10, y: 10 };
const near: MemberCandidate = { id: 1, position: { x: 11, y: 10 } };
const far: MemberCandidate = { id: 2, position: { x: 16, y: 10 } };
const beyondLeash: MemberCandidate = { id: 3, position: { x: 30, y: 10 } };
const LEASH = 15;

describe('resolveMonsterTarget', () => {
  it('初始目標＝最近的成員', () => {
    const state = createMonsterTargetState();
    expect(resolveMonsterTarget(state, monsterPos, [far, near], true, LEASH, 0)).toBe(1);
  });

  it('未激活（roaming）時每 tick 都取最近', () => {
    const state = createMonsterTargetState();
    resolveMonsterTarget(state, monsterPos, [near, far], false, LEASH, 0);
    const moved = { ...near, position: { x: 20, y: 10 } };
    expect(resolveMonsterTarget(state, monsterPos, [moved, far], false, LEASH, 300)).toBe(2);
  });

  it('判定之間不換目標，即使別人更近或傷害更高', () => {
    const state = createMonsterTargetState();
    resolveMonsterTarget(state, monsterPos, [near, far], true, LEASH, 0);
    recordMonsterDamage(state, 2, 999, 1000);
    const nearMoved = { ...near, position: { x: 18, y: 10 } };
    expect(resolveMonsterTarget(state, monsterPos, [nearMoved, far], true, LEASH, 4000)).toBe(1);
  });

  it('每 5 秒判定：脫離範圍內最近 5 秒受傷最高者', () => {
    const state = createMonsterTargetState();
    resolveMonsterTarget(state, monsterPos, [near, far, beyondLeash], true, LEASH, 0);
    recordMonsterDamage(state, 2, 50, 4000);
    recordMonsterDamage(state, 3, 500, 4500);
    expect(resolveMonsterTarget(state, monsterPos, [near, far, beyondLeash], true, LEASH, TARGET_DECISION_INTERVAL_MS)).toBe(2);
  });

  it('判定時無候選（沒人造成傷害）→ 取最近的成員', () => {
    const state = createMonsterTargetState();
    resolveMonsterTarget(state, monsterPos, [far, near], true, LEASH, 0);
    state.targetId = 2;
    expect(resolveMonsterTarget(state, monsterPos, [far, near], true, LEASH, TARGET_DECISION_INTERVAL_MS)).toBe(1);
  });

  it('目標死亡或離線：不等下次判定，立即取最近', () => {
    const state = createMonsterTargetState();
    resolveMonsterTarget(state, monsterPos, [near, far], true, LEASH, 0);
    expect(resolveMonsterTarget(state, monsterPos, [far], true, LEASH, 600)).toBe(2);
  });

  it('沒有候選時目標為 null', () => {
    const state = createMonsterTargetState();
    resolveMonsterTarget(state, monsterPos, [near], true, LEASH, 0);
    expect(resolveMonsterTarget(state, monsterPos, [], true, LEASH, 600)).toBeNull();
  });

  it('受傷量只算最近 5 秒', () => {
    const state = createMonsterTargetState();
    recordMonsterDamage(state, 1, 100, 0);
    recordMonsterDamage(state, 1, 30, 3000);
    expect(recentDamage(state, 1, 4000)).toBe(130);
    expect(recentDamage(state, 1, DAMAGE_WINDOW_MS + 1)).toBe(30);
  });
});
