import { describe, it, expect } from 'vitest';
import { CLASS_SKILLS } from '../../models/classSkills';

/** `23-class-magic.md` § 23.1.1 A 組：走快照物理的職業技能 */
describe('A 組快照物理技能', () => {
  const classSkills = CLASS_SKILLS.map(c => c.skill);

  it('名單與文件一致（含復仇之刃、背刺）', () => {
    const marked = classSkills.filter(s => s.physicalSnapshot).map(s => s.id).sort();
    expect(marked).toEqual(['backstab', 'binding-arrow', 'charge', 'leap-shot', 'rend', 'shield-bash', 'taunt', 'vengeance']);
  });

  it('復仇之刃 36、背刺 69（§ 23.3／§ 23.7）', () => {
    expect(classSkills.find(s => s.id === 'vengeance')!.power).toBe(36);
    expect(classSkills.find(s => s.id === 'backstab')!.power).toBe(69);
  });
});
