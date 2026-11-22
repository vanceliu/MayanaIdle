/**
 * 職業交界命星的效果（`56-star-chart.md` § 56.6）：每顆的收益與代價都要在戰鬥中生效。
 */
import { describe, it, expect } from 'vitest';
import {
  getCombatBonuses, getTotalAttackSpeedPercent, starDamageDealtFactor, starLowHpPowerPct, starStat,
} from '../combat';
import { getHpRegen } from '../regen';
import { getMaxHp } from '../maxHpMp';
import { resolveSkill } from '../../models/skillStar';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import type { Character, ClassName } from '../../models/character';
import { CLASS_BASE_ATTRIBUTES } from '../../models/character';

const zero = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
function char(starChart: string[], overrides: Partial<Character> = {}, className: ClassName = 'thief'): Character {
  return {
    name: 'T', className, level: 60, exp: 0, expToNext: 100, hp: 500, mp: 500,
    baseAttributes: { ...CLASS_BASE_ATTRIBUTES[className] }, bonusAttributes: { ...zero }, starChart,
    gold: 0, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1, ...overrides,
  };
}
/** 交界 i（騎士／盜賊 0、盜賊／妖精 1、妖精／元素師 2、元素師／牧師 3、牧師／騎士 4）的第 k 顆 */
const ks = (i: number, k: number) => `risk${i}-keystone${k}`;

describe('職業交界命星', () => {
  it('狂戰：攻擊力 +20%、受到傷害 +15%', () => {
    const c = char([ks(0, 0)]);
    expect(getCombatBonuses([], [], c).attack_power).toBe(20);
    expect(starStat(c, 'damageTakenPct')).toBe(15);
  });

  it('背水：HP 低於最大 HP 50% 時攻擊力、魔攻 +30%；最大 HP -10%', () => {
    const base = char([ks(0, 1)]);
    const maxHp = getMaxHp(base, []);
    expect(starLowHpPowerPct(char([ks(0, 1)], { hp: Math.floor(maxHp * 0.45) }), [])).toBe(30);
    expect(starLowHpPowerPct(char([ks(0, 1)], { hp: maxHp }), [])).toBe(0);
    expect(getCombatBonuses([], [], char([ks(0, 1)], { hp: 1 })).attack_power).toBe(30);
    expect(starStat(base, 'hpPct')).toBe(-10);
  });

  it('孤注：爆擊傷害 +40%、防禦 -15%', () => {
    const b = getCombatBonuses([], [], char([ks(1, 0)]));
    expect([b.crit_damage, b.defense]).toEqual([40, -15]);
  });

  it('獨行：未組隊造成傷害 ×1.15、組隊 ×0.9', () => {
    const c = char([ks(1, 1)]);
    expect(starDamageDealtFactor(c, false, false)).toBeCloseTo(1.15);
    expect(starDamageDealtFactor(c, true, true)).toBeCloseTo(0.9);
  });

  it('疾風：攻速 +15%、最大 HP -15%', () => {
    const c = char([ks(2, 0)]);
    expect(getTotalAttackSpeedPercent([], [], c)).toBe(15);
    expect(starStat(c, 'hpPct')).toBe(-15);
  });

  it('碎玉：魔法攻擊 +20%、最大 HP -20%', () => {
    const c = char([ks(3, 0)], {}, 'elementalist');
    expect([starStat(c, 'matkPct'), starStat(c, 'hpPct')]).toEqual([20, -20]);
  });

  it('燃魔：技能傷害 ×1.15（普攻不算）；技能耗魔 +30%（floor），血契扣加成後的耗魔', () => {
    const c = char([ks(3, 1)], {}, 'elementalist');
    expect(starDamageDealtFactor(c, true, false)).toBeCloseTo(1.15);
    expect(starDamageDealtFactor(c, false, false)).toBe(1);
    const fireball = instantiateFromTemplate('fireball', 0)!;
    const burned = Math.floor(fireball.mpCost * 1.3);
    expect(burned).toBeGreaterThan(fireball.mpCost);
    expect(resolveSkill(fireball, [], c).mpCost).toBe(burned);
    const withPact = resolveSkill(fireball, [], char([ks(3, 1), 'center-0-k'], {}, 'elementalist'));
    expect([withPact.mpCost, withPact.hpCost]).toEqual([0, burned]);
  });

  it('嗜血：普攻回血、技能回血各 +5%、補藥效果 -20%；自然回血照常', () => {
    const c = char([ks(4, 0)], { hp: 1 }, 'priest');
    const b = getCombatBonuses([], [], c);
    expect([b.attack_lifesteal, b.skill_lifesteal, b.potion_effect]).toEqual([5, 5, -20]);
    expect(getHpRegen(c, false)).toBe(getHpRegen(char([], { hp: 1 }, 'priest'), false));
  });

  it('貪婪：掉寶率、金幣 +20%；攻擊力、魔攻 -12%', () => {
    const c = char([ks(4, 1)], {}, 'priest');
    const b = getCombatBonuses([], [], c);
    expect([b.drop_rate, b.gold_rate, b.attack_power, starStat(c, 'matkPct')]).toEqual([20, 20, -12, -12]);
  });
});

describe('交界命星在實戰路徑生效', () => {
  it('獨行：同一下普攻，單人時傷害 ×1.15', async () => {
    const { vi } = await import('vitest');
    const { processPlayerAttack } = await import('../arpgEventHandler');
    const { useGameStore } = await import('../../stores/gameStore');
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const target = () => ({
      templateId: 1, name: '木樁', level: 1, currentHp: 99999, maxHp: 99999, attackMin: 1, attackMax: 1, defense: 0, exp: 0,
      race: 'normal', size: 'small', element: 'none', isBoss: false, attackType: 'melee', attackRange: 1.5, attackInterval: 100000,
    }) as never;
    const mapMonsters = [{ id: 'm1', position: { x: 6, y: 5 }, isBoss: false }] as never;
    const hit = (starChart: string[]) => {
      const c = char(starChart);
      useGameStore.setState({ character: c, activeEffects: [], skills: [], equippedGear: {} });
      const r = processPlayerAttack(
        { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: ['m1'] },
        { character: c, equippedGear: [], activeEffects: [], skills: [], monsterInstances: new Map([['m1', target()]]), mapMonsters },
      );
      return r.damages[0].damage;
    };
    const plain = hit([]);
    expect(plain).toBeGreaterThan(1);
    expect(hit([ks(1, 1)])).toBe(Math.max(1, Math.floor(plain * 1.15)));
    vi.restoreAllMocks();
  });
});
