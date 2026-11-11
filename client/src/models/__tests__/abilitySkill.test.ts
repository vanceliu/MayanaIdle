/**
 * 職業池隨機技能對技能數值的改寫（`07-affix-ability.md` § 7S.5 職業池）。
 */
import { describe, it, expect } from 'vitest';
import { applyAbilityToSkill, applyAbilityToSkills, ENVENOM_DOT_BONUS_STAT, FIRE_ENCHANT_ANY_WEAPON_STAT, withNextAttackBonus, NEXT_ATTACK_BONUS_CATEGORY } from '../abilitySkill';
import { instantiateFromTemplate } from '../skillTemplate';
import type { Ability, AbilityType } from '../ability';
import type { ClassName } from '../character';
import type { Skill } from '../skill';

const skill = (id: string) => instantiateFromTemplate(id)!;
const gearWith = (type: AbilityType, params: Record<string, number>) => [{ ability: { type, params } as Ability }];
const apply = (id: string, cls: ClassName, type: AbilityType, params: Record<string, number> = {}) =>
  applyAbilityToSkill(skill(id), gearWith(type, params), cls);

describe('職業不符或沒有技能時不改', () => {
  it('回傳原物件', () => {
    const s = skill('rend');
    expect(applyAbilityToSkill(s, gearWith('rend_boost', { percent: 20 }), 'elf')).toBe(s);
    expect(applyAbilityToSkill(s, [], 'knight')).toBe(s);
    const list = [s];
    expect(applyAbilityToSkills(list, gearWith('bonus_damage', { chance: 5, damage: 5 }), 'knight')).toBe(list);
  });
});

describe('騎士', () => {
  it('盾擊暈眩時間 ×(1 + X%)，持盾與否都放大', () => {
    const s = apply('shield-bash', 'knight', 'shield_bash_boost', { percent: 20 });
    const base = skill('shield-bash').applyDebuff!;
    expect(s.applyDebuff!.duration).toBe(Math.floor(base.duration! * 1.2));
    expect(s.applyDebuff!.shieldDuration).toBe(Math.floor(base.shieldDuration! * 1.2));
  });

  it('裂傷斬流血比例 ×(1 + X%)', () => {
    const s = apply('rend', 'knight', 'rend_boost', { percent: 30 });
    expect(s.applyDebuff!.dotDamagePercent).toBeCloseTo(0.7 * 1.3);
    expect(s.applyDebuff!.twoHandedDotDamagePercent).toBeCloseTo(0.85 * 1.3);
  });

  it('鋼鐵護盾減傷改為 X%、持續不變', () => {
    const s = apply('iron-shield', 'knight', 'iron_shield_boost', { reduction: 23 });
    expect(s.buffModifiers).toEqual([{ stat: 'damageReduction', value: 23, isPercent: true }]);
    expect(s.buffDuration).toBe(skill('iron-shield').buffDuration);
  });

  it('血濺咒殺次數 +X；復仇之刃改固定攻擊力', () => {
    expect(apply('blood-curse', 'knight', 'blood_curse_boost', { hits: 3 }).randomHits).toBe(7);
    const v = apply('vengeance', 'knight', 'vengeance_boost', { percent: 15 }).selfBuff!;
    expect(v.scaleByMissingHp).toBeUndefined();
    expect(v.modifiers).toEqual([{ stat: 'attack_power', value: 15, isPercent: true }]);
    expect(v.duration).toBe(10000);
  });
});

describe('妖精', () => {
  it('火矢附魔加任意武器標記；三連射箭數；鷹眼遠攻', () => {
    expect(apply('fire-arrow', 'elf', 'fire_arrow_boost').buffModifiers).toContainEqual({ stat: FIRE_ENCHANT_ANY_WEAPON_STAT, value: 15, isPercent: false });
    expect(apply('triple-shot', 'elf', 'triple_shot_boost', { arrows: 2 }).hits).toBe(5);
    expect(apply('hawk-eye', 'elf', 'hawk_eye_boost', { ranged: 2 }).buffModifiers).toContainEqual({ stat: 'ranged_attack', value: 5, isPercent: false });
  });

  it('束縛箭／後躍射擊冷卻縮短、定身延長', () => {
    const b = apply('binding-arrow', 'elf', 'binding_arrow_boost', { cooldown: 1500, root: 2000 });
    expect(b.cooldown).toBe(skill('binding-arrow').cooldown - 1500);
    expect(b.applyDebuff!.duration).toBe(skill('binding-arrow').applyDebuff!.duration! + 2000);
    expect(apply('leap-shot', 'elf', 'leap_shot_boost', { cooldown: 3000 }).cooldown).toBe(skill('leap-shot').cooldown - 3000);
  });

  it('穿透箭雨改走普攻公式（每目標一發）', () => {
    const s = apply('arrow-rain', 'elf', 'arrow_rain_boost');
    expect(s).toMatchObject({ hits: 1, power: 0, ignoreDefensePercent: 50, target: 'aoe' });
  });
});

describe('元素師', () => {
  it('魔力奪取／元素風暴傷害加成、元素增幅冷卻', () => {
    expect(apply('mana-drain', 'elementalist', 'mana_drain_boost', { percent: 20 }).abilityDamagePercent).toBe(20);
    const storm = apply('element-storm', 'elementalist', 'element_storm_boost', { mp: 10, damage: 15 });
    expect(storm).toMatchObject({ mpCost: 70, abilityDamagePercent: 15 });
    expect(apply('element-boost', 'elementalist', 'element_boost_boost', { cooldown: 5000 }).cooldown).toBe(55000);
  });

  it('魔力護盾另加 buff 減傷；魔力湧泉回魔乘算、扣血乘算', () => {
    expect(apply('mana-shield', 'elementalist', 'mana_shield_boost', { reduction: 10 }).buffModifiers)
      .toContainEqual({ stat: 'damageReduction', value: 10, isPercent: true });
    const spring = apply('mana-spring', 'elementalist', 'mana_spring_boost', { regen: 10, hpCost: 10 });
    expect(spring.buffModifiers![0].value).toBeCloseTo(8.8);
    expect(spring.selfHpCostPercent).toBeCloseTo(9);
  });
});

describe('牧師', () => {
  it('聖光護盾吸收與持續；群體治癒、聖光審判', () => {
    const shield = apply('holy-shield', 'priest', 'holy_shield_boost', { absorb: 50, duration: 3000 });
    expect(shield.buffModifiers).toEqual([{ stat: 'shield_absorb', value: 150, isPercent: false }]);
    expect(shield.buffDuration).toBe(23000);
    expect(apply('group-heal', 'priest', 'group_heal_boost', { mp: 10, power: 20 })).toMatchObject({ mpCost: 50, power: Math.floor(53 * 1.2) });
    expect(apply('holy-judgment', 'priest', 'holy_judgment_boost', { targets: 2, power: 10 })).toMatchObject({ maxTargets: 8, power: Math.floor(37 * 1.1) });
  });

  it('血魔轉換扣血改為 X%；神聖懲擊突進＋暈眩；神聖領域', () => {
    expect(apply('blood-mana', 'priest', 'blood_mana_boost', { hpCost: 10 }).selfHpCostPercent).toBe(10);
    const smite = apply('holy-smite', 'priest', 'holy_smite_boost', { stun: 1500 });
    expect(smite).toMatchObject({ dash: true, dashOptional: true, lifestealPercent: 30 });
    expect(smite.applyDebuff).toMatchObject({ stun: true, duration: 1500 });
    expect(apply('holy-domain', 'priest', 'holy_domain_boost', { mp: 15, cooldown: 15000 })).toMatchObject({ mpCost: 75, cooldown: 75000 });
  });

  it('精神匯聚帶下一次攻擊加成，施放時掛 buff、重複施放不疊加', () => {
    const s = apply('high-heal', 'priest', 'spirit_gathering_boost', { percent: 12 });
    expect(s.nextAttackBonusPercent).toBe(12);
    const once = withNextAttackBonus([], s, 1000);
    const twice = withNextAttackBonus(once, s, 2000);
    expect(twice.filter(e => e.category === NEXT_ATTACK_BONUS_CATEGORY)).toHaveLength(1);
    expect(withNextAttackBonus([], skill('high-heal') as Skill, 1000)).toEqual([]);
  });
});

describe('盜賊', () => {
  it('淬毒加成寫進 buff；致命一擊／背刺持續；煙霧彈次數；精準打擊', () => {
    expect(apply('envenom', 'thief', 'envenom_boost', { percent: 60 }).buffModifiers).toContainEqual({ stat: ENVENOM_DOT_BONUS_STAT, value: 60, isPercent: true });
    expect(apply('deadly-strike', 'thief', 'deadly_strike_boost', { duration: 3000 }).buffDuration).toBe(18000);
    expect(apply('backstab', 'thief', 'backstab_boost', { duration: 4000 }).selfBuff!.duration).toBe(9000);
    expect(apply('smoke-bomb', 'thief', 'smoke_bomb_boost').evadeCharges).toBe(2);
    const p = apply('precision-strike', 'thief', 'precision_strike_boost', { defense: 3, crit: 5 });
    expect(p.buffModifiers).toContainEqual({ stat: 'crit_rate', value: 15, isPercent: true });
    expect(p.buffModifiers).toContainEqual({ stat: 'defense', value: 3, isPercent: false });
  });

  it('毒霧改立即傷害', () => {
    expect(apply('poison-mist', 'thief', 'poison_mist_boost')).toMatchObject({ dotOnly: false, instantDotTicks: 10 });
  });
});
