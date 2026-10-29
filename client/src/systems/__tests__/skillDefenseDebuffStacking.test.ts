import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack } from '../arpgEventHandler';
import { getMonsterDebuffModifierById } from '../combat';
import { useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
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

const NOW = 80_000;

function testCharacter(): Character {
  return {
    name: 'Mage', className: 'elementalist', level: 75, exp: 0, expToNext: 100,
    hp: 500, maxHp: 500, mp: 999, maxMp: 999,
    baseAttributes: { STR: 8, AGI: 8, VIT: 18, SPI: 16, INT: 35, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function target(): MonsterInstance {
  return {
    templateId: 199, name: '百柱死神', level: 80, currentHp: 999_999, maxHp: 999_999,
    attackMin: 250, attackMax: 300, defense: 65, exp: 0,
    race: 'undead', size: 'large', element: 'dark', isBoss: true,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: true }] as unknown as MapMonster[];

function cast(skillId: string, monster: MonsterInstance, activeEffects: ActiveEffect[]) {
  const skill = { ...getSkillTemplate(skillId)!, lastUsedAt: 0 } as Skill;
  const character = testCharacter();
  useGameStore.setState({ character, skills: [skill], activeEffects, equippedGear: {}, combatLogs: [] });
  processPlayerAttack(
    { type: 'player_attack', action: { type: 'skill', skillId }, targetMonsterIds: ['m1'], skill },
    { character, equippedGear: [], activeEffects, skills: [skill], monsterInstances: new Map([['m1', monster]]), mapMonsters },
  );
  return useGameStore.getState().activeEffects;
}

const defenseMod = (effects: ActiveEffect[]) => getMonsterDebuffModifierById(effects, 'm1', 'defense');

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('技能降防的疊加（24-buff-debuff.md § 24.3.1）', () => {
  it('詛咒與護甲崩壞分屬不同 category，防禦修正加總', () => {
    const monster = target();
    let effects = cast('curse', monster, []);
    effects = cast('armor-break', monster, effects);

    expect(defenseMod(effects)).toBe(-35);
  });

  it('極冰封印與護甲崩壞同屬 defense-down，後施放者覆蓋', () => {
    const monster = target();
    let effects = cast('curse', monster, []);
    effects = cast('armor-break', monster, effects);
    effects = cast('absolute-zero', monster, effects);

    expect(effects.filter(e => e.target === 'monster' && e.category === 'defense-down')).toHaveLength(1);
    expect(defenseMod(effects)).toBe(-40);
  });

  it('技能攻擊力 0 的降防技能仍造成傷害並施加 debuff', () => {
    const monster = target();
    const effects = cast('curse', monster, []);

    expect(monster.currentHp).toBeLessThan(999_999);
    expect(defenseMod(effects)).toBe(-20);
  });
});
