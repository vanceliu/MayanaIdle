/**
 * 元素師職業魔法 5～7 級（`23-class-magic.md` § 23.5）：魔力護盾、魔力湧泉、元素風暴。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { absorbWithManaShield, absorbWithShield } from '../combat';
import { processMonsterAttack } from '../arpgEventHandler';
import { getMpRegen } from '../regen';
import { getEffectiveMaxHp, getEffectiveMaxMp, useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import { CLASS_SKILLS } from '../../models/classSkills';
import type { Skill } from '../../models/skill';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { ActiveEffect } from '../../models/effect';
import type { MapMonster } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 800_000;

function mage(overrides: Partial<Character> = {}): Character {
  return {
    name: 'Mage', className: 'elementalist', level: 70, exp: 0, expToNext: 100,
    hp: 500, maxHp: 500, mp: 400, maxMp: 400,
    baseAttributes: { STR: 10, AGI: 10, VIT: 14, SPI: 20, INT: 30, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
    ...overrides,
  };
}

function monster(attack = 100): MonsterInstance {
  return {
    templateId: 1, name: '哥布林', level: 40, currentHp: 999, maxHp: 999,
    attackMin: attack, attackMax: attack, defense: 0, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function buffFrom(skillId: string, overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  const t = getSkillTemplate(skillId)!;
  return {
    id: `buff-${skillId}`, sourceSkillId: skillId, sourceSkillName: t.name,
    category: t.buffCategory!, type: 'buff', target: 'player',
    modifiers: t.buffModifiers ?? [], startTime: NOW, duration: t.buffDuration!,
    tags: [], name: t.name, description: '', ...overrides,
  };
}

const skillOf = (id: string): Skill => ({ ...getSkillTemplate(id)!, lastUsedAt: 0 });
const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
  useGameStore.setState({ character: mage(), skills: [], equippedGear: {}, activeEffects: [], combatLogs: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('元素師 5～7 級定義', () => {
  it('職業魔法共 7 級，元素風暴移到 7 級', () => {
    expect(CLASS_SKILLS.filter(s => s.className === 'elementalist').map(s => [s.classLevel, s.requiredLevel, s.id])).toEqual([
      [1, 10, 'cd-reduce'], [2, 20, 'mana-drain'], [3, 30, 'element-boost'], [4, 40, 'greater-cd-reduce'],
      [5, 50, 'mana-shield'], [6, 60, 'mana-spring'], [7, 70, 'element-storm'],
    ]);
  });

  it('魔力護盾：MP 0、冷卻 5s、持續 300s、30%', () => {
    expect(getSkillTemplate('mana-shield')).toMatchObject({
      type: 'buff', mpCost: 0, cooldown: 5000, buffDuration: 300000, buffCategory: 'mana-shield',
      buffModifiers: [{ stat: 'mana_shield', value: 30, isPercent: true }],
    });
  });

  it('魔力湧泉：不耗 MP、HP 10%、冷卻 30s、持續 60s、每次回魔另加最大 MP 8%', () => {
    expect(getSkillTemplate('mana-spring')).toMatchObject({
      type: 'buff', mpCost: 0, selfHpCostPercent: 10, cooldown: 30000, buffDuration: 60000,
      buffCategory: 'mana-spring', buffModifiers: [{ stat: 'mp_regen_max_percent', value: 8, isPercent: true }],
    });
  });
});

describe('absorbWithManaShield', () => {
  const shield = () => buffFrom('mana-shield');

  it('沒有魔力護盾時原樣通過', () => {
    expect(absorbWithManaShield(100, 50, [], NOW + 100)).toMatchObject({ damage: 100, mpUsed: 0, broken: false });
  });

  it('30% 改扣 MP（無條件捨去），1 點扣 1 MP', () => {
    expect(absorbWithManaShield(101, 500, [shield()], NOW + 100)).toMatchObject({ damage: 71, mpUsed: 30, broken: false });
  });

  it('MP 不足：扣到 0，不足的部分扣 HP，護盾解除', () => {
    const r = absorbWithManaShield(100, 10, [shield()], NOW + 100);
    expect(r).toMatchObject({ damage: 90, mpUsed: 10, broken: true });
    expect(r.effects).toHaveLength(0);
  });

  it('過期不作用', () => {
    expect(absorbWithManaShield(100, 500, [shield()], NOW + 400_000).mpUsed).toBe(0);
  });

  it('聖光護盾先吸收，剩下的才算 30%', () => {
    const holy: ActiveEffect = { ...buffFrom('holy-shield'), shieldRemaining: 40 };
    const afterHoly = absorbWithShield(100, [holy, shield()], NOW + 100);
    const r = absorbWithManaShield(afterHoly.damage, 500, afterHoly.effects, NOW + 100);
    expect(afterHoly.damage).toBe(60);
    expect(r).toMatchObject({ damage: 42, mpUsed: 18 });
  });
});

describe('魔力護盾實戰（怪物攻擊）', () => {
  function hit(effects: ActiveEffect[]) {
    useGameStore.setState({ character: mage(), activeEffects: effects });
    const char = useGameStore.getState().character!;
    const result = processMonsterAttack(
      { type: 'monster_attack', monsterId: 'm1' },
      { character: char, equippedGear: [], activeEffects: effects, skills: [], monsterInstances: new Map([['m1', monster()]]), mapMonsters },
    );
    return { result, char };
  }

  it('同一下攻擊：扣的 HP ＋ MP ＝ 沒有護盾時扣的 HP', () => {
    const plain = hit([]);
    const shielded = hit([buffFrom('mana-shield')]);
    const hpLoss = 500 - shielded.char.hp;
    const mpLoss = 400 - shielded.char.mp;
    expect(mpLoss).toBe(Math.floor((500 - plain.char.hp) * 0.3));
    expect(hpLoss + mpLoss).toBe(500 - plain.char.hp);
  });
});

describe('魔力湧泉', () => {
  it('每次回魔另加有效最大 MP 8%，不受戰鬥減半影響，自然回魔照算', () => {
    const char = mage();
    const spring = [buffFrom('mana-spring')];
    const bonus = Math.floor(getEffectiveMaxMp(char, {}, []) * 0.08);
    expect(getMpRegen(char, true, [], spring) - getMpRegen(char, true, [], [])).toBe(bonus);
    expect(getMpRegen(char, false, [], spring) - getMpRegen(char, false, [], [])).toBe(bonus);
    expect(getMpRegen(char, true, [], [])).toBeGreaterThan(0);
  });

  it('施放：扣有效最大 HP 10%、不扣 MP，掛上 buff', () => {
    const char = mage();
    useGameStore.setState({ character: char, skills: [skillOf('mana-spring')] });
    const maxHp = getEffectiveMaxHp(char, {}, []);
    expect(useGameStore.getState().castSelfSkill('mana-spring')).toBe(true);
    const after = useGameStore.getState();
    expect(after.character!.hp).toBe(500 - Math.floor(maxHp * 0.1));
    expect(after.character!.mp).toBe(400);
    expect(after.activeEffects.some(e => e.category === 'mana-spring')).toBe(true);
  });

  it('HP 為 1 時不可施放', () => {
    useGameStore.setState({ character: mage({ hp: 1 }), skills: [skillOf('mana-spring')] });
    expect(useGameStore.getState().castSelfSkill('mana-spring')).toBe(false);
  });

  it('MP 為 0 也能施放', () => {
    useGameStore.setState({ character: mage({ mp: 0 }), skills: [skillOf('mana-spring')] });
    expect(useGameStore.getState().castSelfSkill('mana-spring')).toBe(true);
  });

  it('重複施放不疊加，只刷新時間', () => {
    useGameStore.setState({ character: mage(), skills: [skillOf('mana-spring')], activeEffects: [buffFrom('mana-spring', { startTime: NOW - 40_000 })] });
    useGameStore.getState().castSelfSkill('mana-spring');
    const springs = useGameStore.getState().activeEffects.filter(e => e.category === 'mana-spring');
    expect(springs).toHaveLength(1);
    expect(springs[0].startTime).toBeGreaterThan(NOW - 40_000);
  });
});
