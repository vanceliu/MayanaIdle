import { describe, it, expect } from 'vitest';
import { getSkillTemplate, instantiateFromTemplate } from '../skillTemplate';

describe('getSkillTemplate', () => {
  it('returns a basic magic skill from SKILL_CATALOG', () => {
    const template = getSkillTemplate('wind-blade');
    expect(template).not.toBeNull();
    expect(template!.id).toBe('wind-blade');
    expect(template!.name).toBe('風刃');
    expect(template!.type).toBe('attack');
  });

  it('returns a class skill from CLASS_SKILLS', () => {
    const template = getSkillTemplate('envenom');
    expect(template).not.toBeNull();
    expect(template!.id).toBe('envenom');
    expect(template!.name).toBe('淬毒');
    expect(template!.onHitDebuff).toBeDefined();
    expect(template!.onHitDebuff!.category).toBe('poisoned');
    expect(template!.onHitDebuff!.dotDamagePercent).toBe(0.3);
  });

  it('returns class skill with applyDebuff (rend)', () => {
    const template = getSkillTemplate('rend');
    expect(template).not.toBeNull();
    expect(template!.id).toBe('rend');
    expect(template!.applyDebuff).toBeDefined();
    expect(template!.applyDebuff!.category).toBe('bleeding');
    expect(template!.applyDebuff!.dotDamagePercent).toBe(0.5);
  });

  it('returns class skill with buffModifiers (iron-shield)', () => {
    const template = getSkillTemplate('iron-shield');
    expect(template).not.toBeNull();
    expect(template!.buffCategory).toBe('defense-buff');
    expect(template!.buffModifiers).toBeDefined();
    expect(template!.buffModifiers!.length).toBeGreaterThan(0);
  });

  it('returns mana drain with final-damage MP restoration', () => {
    const template = getSkillTemplate('mana-drain');
    expect(template).not.toBeNull();
    expect(template!.mpDrainRatio).toBe(1);
  });

  it('returns null for nonexistent skill', () => {
    const template = getSkillTemplate('nonexistent-skill');
    expect(template).toBeNull();
  });

  it('prioritizes SKILL_CATALOG over CLASS_SKILLS for same id', () => {
    const template = getSkillTemplate('wind-blade');
    expect(template).not.toBeNull();
    expect(template!.element).toBe('wind');
  });
});

describe('instantiateFromTemplate', () => {
  it('creates a full Skill with lastUsedAt from a catalog skill', () => {
    const skill = instantiateFromTemplate('fireball', 0);
    expect(skill).not.toBeNull();
    expect(skill!.id).toBe('fireball');
    expect(skill!.lastUsedAt).toBe(0);
    expect(skill!.type).toBe('attack');
    expect(skill!.element).toBe('fire');
  });

  it('creates a full Skill with lastUsedAt from a class skill', () => {
    const skill = instantiateFromTemplate('envenom', 12345);
    expect(skill).not.toBeNull();
    expect(skill!.id).toBe('envenom');
    expect(skill!.lastUsedAt).toBe(12345);
    expect(skill!.onHitDebuff).toBeDefined();
  });

  it('returns null for nonexistent skill', () => {
    const skill = instantiateFromTemplate('fake-skill');
    expect(skill).toBeNull();
  });

  it('preserves all template fields without mutation', () => {
    const skill1 = instantiateFromTemplate('envenom', 100);
    const skill2 = instantiateFromTemplate('envenom', 200);
    expect(skill1!.lastUsedAt).toBe(100);
    expect(skill2!.lastUsedAt).toBe(200);
  });
});
