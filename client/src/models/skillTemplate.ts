import { SKILL_CATALOG, type Skill } from './skill';
import { CLASS_SKILLS } from './classSkills';

export function getSkillTemplate(id: string): Omit<Skill, 'lastUsedAt'> | null {
  const catalogSkill = SKILL_CATALOG.find(s => s.id === id);
  if (catalogSkill) return catalogSkill;

  const classSkill = CLASS_SKILLS.find(c => c.skill.id === id);
  if (classSkill) return classSkill.skill;

  return null;
}

export function instantiateFromTemplate(id: string, lastUsedAt: number = 0): Skill | null {
  const template = getSkillTemplate(id);
  if (!template) return null;
  return { ...template, lastUsedAt };
}
