import { describe, it, expect } from 'vitest';
import { CLASS_SKILLS } from '../../models/classSkills';
import { SKILL_CATALOG } from '../../models/skill';

/** `21-combat-formula.md` § 21.8「適用範圍」：魔法公式技能中只有物理系（§ 23.1.1 B 組）判定爆擊 */
describe('魔法公式技能的爆擊標記', () => {
  const classSkills = CLASS_SKILLS.map(c => c.skill);

  it('復仇之刃與背刺標記為物理系', () => {
    const marked = classSkills.filter(s => s.physicalDamage).map(s => s.id).sort();
    expect(marked).toEqual(['backstab', 'vengeance']);
  });

  it('基礎魔法一律不帶物理系標記', () => {
    expect(SKILL_CATALOG.filter(s => s.physicalDamage)).toEqual([]);
  });

  it('物理快照與多段技能不需要標記（走各自的物理函式）', () => {
    const physicalFormula = classSkills.filter(s => s.physicalSnapshot || (s.hits ?? 0) > 1);
    expect(physicalFormula.every(s => !s.physicalDamage)).toBe(true);
  });
});
