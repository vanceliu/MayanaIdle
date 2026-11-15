/** 怪物交戰時的朝向（`25-monster-system.md` § 25.2.2「朝向判定」） */
import { describe, expect, it } from 'vitest';
import { monsterFacingTarget } from '../monsterFacing';

describe('monsterFacingTarget', () => {
  it('攻擊距離內面向最近的成員', () => {
    const near = { x: 6, y: 5 }, far = { x: 4, y: 4 };
    expect(monsterFacingTarget({ x: 5, y: 5 }, 1.5, [far, near])).toBe(near);
  });

  it('都在射程外回傳 null（依移動方向）', () => {
    expect(monsterFacingTarget({ x: 5, y: 5 }, 1.5, [{ x: 9, y: 9 }])).toBeNull();
    expect(monsterFacingTarget({ x: 5, y: 5 }, 1.5, [])).toBeNull();
  });

  it('遠程射程較長；射程未回填時用近戰距離', () => {
    const member = { x: 9, y: 5 };
    expect(monsterFacingTarget({ x: 5, y: 5 }, 6, [member])).toBe(member);
    expect(monsterFacingTarget({ x: 5, y: 5 }, undefined, [member])).toBeNull();
    expect(monsterFacingTarget({ x: 5, y: 5 }, undefined, [{ x: 6, y: 6 }])).toEqual({ x: 6, y: 6 });
  });
});
