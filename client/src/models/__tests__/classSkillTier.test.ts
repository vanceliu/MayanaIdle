/**
 * 職業魔法每職業每級限學 1 個（`23-class-magic.md` § 23.1）。
 */
import { describe, it, expect } from 'vitest';
import { CLASS_SKILLS, findLearnedSameTierClassSkill, type ClassSkillDef } from '../classSkills';

const def = (id: string, className: ClassSkillDef['className'], classLevel: number): ClassSkillDef => {
  const base = CLASS_SKILLS[0];
  return { ...base, id, name: id, className, classLevel, skill: { ...base.skill, id } };
};

const DEFS = [
  def('k1a', 'knight', 1),
  def('k1b', 'knight', 1),
  def('k2', 'knight', 2),
  def('t1', 'thief', 1),
];

describe('findLearnedSameTierClassSkill', () => {
  it('已學會同職業同級的另一個：回傳那一個', () => {
    expect(findLearnedSameTierClassSkill(DEFS[1], ['k1a'], DEFS)?.id).toBe('k1a');
  });

  it('不同級不衝突', () => {
    expect(findLearnedSameTierClassSkill(DEFS[2], ['k1a'], DEFS)).toBeNull();
  });

  it('不同職業同級不衝突', () => {
    expect(findLearnedSameTierClassSkill(DEFS[3], ['k1a'], DEFS)).toBeNull();
  });

  it('基礎魔法不計入', () => {
    expect(findLearnedSameTierClassSkill(DEFS[1], ['wind-blade', 'fireball'], DEFS)).toBeNull();
  });
});
