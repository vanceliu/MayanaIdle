/**
 * 技能標籤（`05-skill.md` § 5.5 標籤表）。
 */
import { describe, it, expect } from 'vitest';
import { dotTags, NORMAL_ATTACK_TAGS, skillTags, type SkillTag } from '../skillTags';
import { applyAbilityToSkill } from '../abilitySkill';
import { instantiateFromTemplate } from '../skillTemplate';
import { instantiateSkill, SKILL_CATALOG } from '../skill';
import type { Ability, AbilityType } from '../ability';
import type { ClassName } from '../character';

const classSkill = (id: string) => instantiateFromTemplate(id)!;
const rewritten = (id: string, type: AbilityType, cls: ClassName) =>
  applyAbilityToSkill(classSkill(id), [{ ability: { type, params: {} } as Ability }], cls);

const SINGLE_PHYSICAL_SNAPSHOT: SkillTag[] = ['skill', 'single_skill', 'physical', 'magic'];

describe('職業技能標籤表', () => {
  it.each([
    ['shield-bash', SINGLE_PHYSICAL_SNAPSHOT],
    ['rend', SINGLE_PHYSICAL_SNAPSHOT],
    ['taunt', SINGLE_PHYSICAL_SNAPSHOT],
    ['charge', SINGLE_PHYSICAL_SNAPSHOT],
    ['vengeance', SINGLE_PHYSICAL_SNAPSHOT],
    ['blood-curse', ['skill', 'skill_elemental', 'magic', 'dark']],
    ['triple-shot', ['basic_attack', 'single_basic_attack', 'physical', 'bow']],
    ['binding-arrow', [...SINGLE_PHYSICAL_SNAPSHOT, 'bow']],
    ['leap-shot', [...SINGLE_PHYSICAL_SNAPSHOT, 'bow']],
    ['arrow-rain', ['skill', 'magic', 'bow']],
    ['mana-drain', ['skill', 'single_skill', 'magic']],
    ['element-storm', ['skill', 'skill_elemental', 'magic', 'fire']],
    ['holy-smite', ['skill', 'single_skill', 'skill_elemental', 'magic', 'light']],
    ['holy-judgment', ['skill', 'skill_elemental', 'magic', 'light']],
    ['deadly-strike', SINGLE_PHYSICAL_SNAPSHOT],
    ['backstab', SINGLE_PHYSICAL_SNAPSHOT],
    ['poison-mist', []],
    ['dodge-counter', NORMAL_ATTACK_TAGS],
    ['envenom', []],
    ['iron-shield', []],
    ['group-heal', []],
  ] as [string, SkillTag[]][])('%s', (id, expected) => {
    expect(skillTags(classSkill(id))).toEqual(expected);
  });
});

describe('職業池改寫後依改寫後的技能重算', () => {
  it('血濺斬擊：血濺咒殺改為【普攻】【物理】，不帶【單體普攻】', () => {
    expect(skillTags(rewritten('blood-curse', 'blood_slash', 'knight'))).toEqual(['basic_attack', 'physical']);
  });

  it('穿透箭雨強化：改為【普攻】【物理】【弓】，不帶【單體普攻】', () => {
    expect(skillTags(rewritten('arrow-rain', 'arrow_rain_boost', 'elf'))).toEqual(['basic_attack', 'physical', 'bow']);
  });

  it('冰霧強化：【技能】【技能元素】【物理】【冰】，不帶【魔法】', () => {
    expect(skillTags(rewritten('poison-mist', 'poison_mist_boost', 'thief'))).toEqual(['skill', 'skill_elemental', 'physical', 'ice']);
  });

  it('神聖懲擊強化（突進）不影響標籤', () => {
    expect(skillTags(rewritten('holy-smite', 'holy_smite_boost', 'priest'))).toEqual(skillTags(classSkill('holy-smite')));
  });
});

describe('持續傷害標籤', () => {
  it('流血、凍傷、中毒帶【持續傷害】【物理】與其元素，不帶施放技能的【技能】【魔法】', () => {
    const rend = classSkill('rend');
    const mist = classSkill('poison-mist');
    const envenom = classSkill('envenom');
    expect(dotTags(rend, rend.applyDebuff)).toEqual(['dot', 'physical']);
    expect(dotTags(mist, mist.applyDebuff)).toEqual(['dot', 'physical', 'ice']);
    expect(dotTags(envenom, envenom.onHitDebuff)).toEqual(['dot', 'physical']);
  });

  it('冰霧強化改為立即傷害，沒有持續傷害', () => {
    const mist = rewritten('poison-mist', 'poison_mist_boost', 'thief');
    expect(dotTags(mist, mist.applyDebuff)).toEqual([]);
  });

  it('盾擊的暈眩不是持續傷害', () => {
    const bash = classSkill('shield-bash');
    expect(dotTags(bash, bash.applyDebuff)).toEqual([]);
  });
});

describe('基礎魔法', () => {
  it('單體攻擊魔法：【技能】【單體技能】【技能元素】【魔法】＋元素', () => {
    expect(skillTags(instantiateSkill('wind-blade')!)).toEqual(['skill', 'single_skill', 'skill_elemental', 'magic', 'wind']);
  });

  it('範圍攻擊魔法：不帶【單體技能】', () => {
    expect(skillTags(instantiateSkill('fireball')!)).toEqual(['skill', 'skill_elemental', 'magic', 'fire']);
  });

  it('究極光裂術無屬性：不帶【技能元素】與元素', () => {
    const ultimate = SKILL_CATALOG.find(s => s.name === '究極光裂術')!;
    expect(skillTags(ultimate)).toEqual(['skill', 'single_skill', 'magic']);
  });

  it('詛咒、護甲崩壞、治癒、輔助沒有標籤', () => {
    for (const name of ['詛咒', '護甲崩壞', '治癒', '保護罩']) {
      expect(skillTags(SKILL_CATALOG.find(s => s.name === name)!)).toEqual([]);
    }
  });
});
