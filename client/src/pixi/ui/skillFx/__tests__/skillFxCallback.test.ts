import { describe, it, expect } from 'vitest';
import { playSkillFx, type SkillFxTarget } from '../playSkillFx';
import { resolvePlayerAttackFxPlan } from '../combatFx';
import { SKILL_CATALOG } from '../../../../models/skill';
import { CLASS_SKILLS } from '../../../../models/classSkills';
import type { SkillFxManager } from '../SkillFxManager';

/**
 * 逐下回呼（`onLandHit`）必須每一條演出路徑都接得到（`48-vfx.md` § 48.7.3）。
 *
 * 接不到就是「技能打出去不跳傷害數字」—— 而且完全不會報錯，
 * 只有實際去看畫面才發現。火球（齊射）就這樣壞了一段時間。
 */

interface Spawned {
  onStart?: () => void;
  onArrive?: () => void;
}

/** 收集 spawn，之後一次把所有回呼觸發，模擬全部演出都落地 */
function stubFx(): { fx: SkillFxManager; fireAll: () => void } {
  const spawns: Spawned[] = [];
  const fx = { spawn: (o: Spawned) => { spawns.push(o); } } as unknown as SkillFxManager;
  return {
    fx,
    fireAll: () => { for (const s of spawns) { s.onStart?.(); s.onArrive?.(); } },
  };
}

function target(hits: number, landed: number[]): SkillFxTarget {
  return {
    x: 100, y: 100, crit: false,
    onLandHit: Array.from({ length: hits }, (_, i) => () => landed.push(i)),
  };
}

/** 基礎魔法 ＋ 職業魔法，全部攻擊型技能 */
const ATTACK_SKILLS = [
  ...SKILL_CATALOG,
  ...CLASS_SKILLS.map(c => c.skill),
].filter(s => s.type === 'attack');

describe('技能演出的逐下回呼', () => {
  it('每個攻擊技能都至少觸發一次回呼', () => {
    const missing: string[] = [];
    for (const skill of ATTACK_SKILLS) {
      const landed: number[] = [];
      const { fx, fireAll } = stubFx();
      const plan = resolvePlayerAttackFxPlan({ skill, ranged: true, bow: false, ctx: {} });
      playSkillFx(fx, {
        plan, fromX: 0, fromY: 0, toX: 100, toY: 100,
        targets: [target(1, landed)], speed: 1,
      });
      fireAll();
      if (landed.length === 0) missing.push(skill.id);
    }
    expect(missing).toEqual([]);
  });

  /*
   * 同一下不可觸發兩次 —— `onLand` 與 `onLandHit` 都跑的話，
   * 那一下會跳兩個傷害數字，看起來像打了兩次。
   */
  it('同一下不會觸發兩次', () => {
    const dupes: string[] = [];
    for (const skill of ATTACK_SKILLS) {
      const landed: number[] = [];
      const { fx, fireAll } = stubFx();
      const plan = resolvePlayerAttackFxPlan({ skill, ranged: true, bow: false, ctx: {} });
      playSkillFx(fx, {
        plan, fromX: 0, fromY: 0, toX: 100, toY: 100,
        targets: [target(1, landed)], speed: 1,
      });
      fireAll();
      if (landed.length !== new Set(landed).size) dupes.push(skill.id);
    }
    expect(dupes).toEqual([]);
  });

  // 多段技能（三連射）每一發都要有自己的數字
  it('多段技能的每一發都觸發', () => {
    const multiHit = ATTACK_SKILLS.filter(s => (s.hits ?? 1) > 1);
    expect(multiHit.length).toBeGreaterThan(0);

    for (const skill of multiHit) {
      const landed: number[] = [];
      const { fx, fireAll } = stubFx();
      const plan = resolvePlayerAttackFxPlan({ skill, ranged: true, bow: false, ctx: {} });
      playSkillFx(fx, {
        plan, fromX: 0, fromY: 0, toX: 100, toY: 100,
        targets: [target(skill.hits!, landed)], speed: 1,
      });
      fireAll();
      expect(new Set(landed).size, skill.id).toBe(skill.hits);
    }
  });
});
