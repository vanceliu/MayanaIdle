/**
 * 星盤數值節點與命星在戰鬥公式中的位置（`56-star-chart.md` § 56.4、§ 56.6、§ 56.8）。
 */
import { describe, it, expect } from 'vitest';
import {
  calculateHealAmount, calculateThornsDamage, getBaseMagicAttack, getCombatBonuses, getUncappedPlayerDodgeRate, starStat,
} from '../combat';
import { resolveSkill } from '../../models/skillStar';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import { isSkillHpBlocked, resolveSelfHpCost } from '../../models/skill';
import type { Character, ClassName } from '../../models/character';
import { CLASS_BASE_ATTRIBUTES } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';
import type { MonsterInstance } from '../../models/monster';

const zero = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
function char(className: ClassName, starChart: string[] = []): Character {
  return {
    name: 'T', className, level: 60, exp: 0, expToNext: 100, hp: 500, mp: 500,
    baseAttributes: { ...CLASS_BASE_ATTRIBUTES[className] }, bonusAttributes: { ...zero }, starChart,
    gold: 0, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}
const bow = { templateId: 1, name: '弓', type: 'bow', slot: 'rightHand', isTwoHanded: true, smallMonsterDamage: 10, largeMonsterDamage: 10,
  quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true } as unknown as EquipmentInstance;
const monster = { templateId: 1, name: '木樁', level: 60, currentHp: 9999, maxHp: 9999, attackMin: 1, attackMax: 1, defense: 0, exp: 0,
  race: 'normal', size: 'small', element: 'none', isBoss: false, attackType: 'melee', attackRange: 1.5, attackInterval: 1000 } as MonsterInstance;

describe('數值節點併入同名加成', () => {
  it('攻擊力%、防禦%、迴避值相加；未帶角色時不含星盤', () => {
    // 毒牙座：攻擊力 +2%、命中 +2%、力量 +2；幻步座：迴避值 +100、命中 +2%、敏捷 +2
    const c = char('thief', ['thief-wheel1-s', 'thief-wheel0-s', 'knight-wheel0-s']);
    const b = getCombatBonuses([], [], c);
    expect(b.attack_power).toBe(2);
    expect(b.evasion).toBe(100);
    expect(b.defense).toBe(2); // 堅盾座：防禦力 +2%
    expect(getCombatBonuses([], []).attack_power).toBe(0);
    expect(starStat(c, 'hit')).toBe(4);
  });

  it('鷹隼之星的遠程攻擊力% 只在裝備弓時計入攻擊力%', () => {
    const c = char('elf', ['elf-keystone']);
    expect(getCombatBonuses([bow], [], c).attack_power).toBe(8);
    expect(getCombatBonuses([], [], c).attack_power).toBe(0);
  });

  it('影刃之星爆擊率 +5%；聖誓之星治癒量 +12%', () => {
    expect(getCombatBonuses([], [], char('thief', ['thief-keystone'])).crit_rate).toBe(5);
    const plain = calculateHealAmount(char('priest'), 53, [], []);
    expect(calculateHealAmount(char('priest', ['priest-keystone']), 53, [], [])).toBe(Math.floor(plain * 1.12));
  });
});

describe('魔法攻擊%：與裝備魔攻同格相加，只給傷害', () => {
  it('技能攻擊力 × (1 + 星盤%)；治癒不吃', () => {
    const plain = getBaseMagicAttack(char('elementalist'), 100, 'none', monster, [], []);
    const boosted = getBaseMagicAttack(char('elementalist', ['elementalist-keystone']), 100, 'none', monster, [], []);
    expect(boosted - plain).toBe(10); // 奧能之星 +10%：floor(100 × 1.1) − 100
    expect(calculateHealAmount(char('elementalist', ['elementalist-keystone']), 100, [], []))
      .toBe(calculateHealAmount(char('elementalist'), 100, [], []));
  });
});

describe('命星的規則類效果', () => {
  it('堅忍之星：迴避率合計 ×0.75、防禦 -10%', () => {
    const plain = getUncappedPlayerDodgeRate(char('knight'), [], []);
    expect(getUncappedPlayerDodgeRate(char('knight', ['center-240-k']), [], [])).toBeCloseTo(plain * 0.75, 6);
    expect(getCombatBonuses([], [], char('knight', ['center-240-k'])).defense).toBe(-10);
  });

  it('不屈之星：受到傷害 −5% 併入 buff 減傷', () => {
    const plain = calculateThornsDamage(1000, [], [], char('knight'));
    expect(calculateThornsDamage(1000, [], [], char('knight', ['knight-keystone']))).toBe(Math.floor(plain * 0.95));
  });

  it('血契之星：耗魔改扣等量 HP；HP 不高於消耗不可施放', () => {
    const c = char('elementalist', ['center-0-k']);
    const s = resolveSkill(instantiateFromTemplate('fireball')!, [], c);
    expect(s.mpCost).toBe(0);
    expect(s.hpCost).toBe(15);
    expect(isSkillHpBlocked(s, 15)).toBe(true);
    expect(isSkillHpBlocked(s, 16)).toBe(false);
    expect(resolveSelfHpCost(s, 500, 1000)).toBe(15);
  });
});
