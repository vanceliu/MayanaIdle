import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack } from '../arpgEventHandler';
import { getMonsterDebuffModifierById } from '../combat';
import { tickMonsterCombat, createMonsterCombatContext } from '../monsterCombatFSM';
import { useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
import type { ActiveEffect } from '../../models/effect';
import type { MapMonster } from '../../stores/mapMonsterStore';
import type { MapData } from '../../models/mapControl';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 70_000;
const ICE_SLOW_SKILLS = ['frost', 'ice-fog', 'ice-ring', 'blizzard', 'blizzard-storm'];

function testCharacter(): Character {
  return {
    name: 'Mage', className: 'elementalist', level: 40, exp: 0, expToNext: 100,
    hp: 300, maxHp: 300, mp: 300, maxMp: 300,
    baseAttributes: { STR: 10, AGI: 12, VIT: 12, SPI: 15, INT: 25, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function target(): MonsterInstance {
  return {
    templateId: 5, name: '哥布林', level: 20, currentHp: 99999, maxHp: 99999,
    attackMin: 10, attackMax: 10, defense: 0, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

function cast(skillId: string, monster: MonsterInstance, activeEffects: ActiveEffect[] = []) {
  const skill = { ...getSkillTemplate(skillId)!, lastUsedAt: 0 } as Skill;
  const character = testCharacter();
  useGameStore.setState({ character, skills: [skill], activeEffects, equippedGear: {}, combatLogs: [] });
  return processPlayerAttack(
    { type: 'player_attack', action: { type: 'skill', skillId }, targetMonsterIds: ['m1'], skill },
    { character, equippedGear: [], activeEffects, skills: [skill], monsterInstances: new Map([['m1', monster]]), mapMonsters },
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('冰系基礎魔法減速（22-basic-magic.md）', () => {
  it('五個冰系減速技能皆定義為攻速 -30%、持續 6 秒', () => {
    for (const id of ICE_SLOW_SKILLS) {
      const skill = getSkillTemplate(id)!;
      expect(skill.applyDebuff, id).toMatchObject({
        category: 'slow',
        duration: 6000,
        modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }],
        tags: ['slowed'],
      });
    }
  });

  it('冰彈、冰槍無減速效果', () => {
    for (const id of ['ice-bolt', 'ice-lance']) {
      expect(getSkillTemplate(id)!.applyDebuff, id).toBeUndefined();
    }
  });

  it('極冰封印為防禦下降而非減速（§ 22.3 10 級）', () => {
    expect(getSkillTemplate('absolute-zero')!.applyDebuff).toMatchObject({
      category: 'defense-down',
      duration: 10000,
      modifiers: [{ stat: 'defense', value: -20, isPercent: true }],
    });
  });

  it('命中後對怪物施加減速 debuff', () => {
    cast('ice-fog', target());

    const slow = useGameStore.getState().activeEffects.find(e => e.category === 'slow');
    expect(slow).toBeDefined();
    expect(slow?.target).toBe('monster');
    expect(slow?.targetMonsterId).toBe('m1');
    expect(slow?.duration).toBe(6000);
  });

  it('§ 24.3.1：同 category 數值 debuff 由後施放覆蓋前者（刷新時間）', () => {
    const monster = target();
    cast('frost', monster);
    const first = useGameStore.getState().activeEffects.find(e => e.category === 'slow')!;

    vi.spyOn(Date, 'now').mockReturnValue(NOW + 3000);
    cast('ice-fog', monster, useGameStore.getState().activeEffects);

    const effects = useGameStore.getState().activeEffects.filter(e => e.category === 'slow');
    expect(effects).toHaveLength(1);
    expect(effects[0].startTime).toBe(NOW + 3000);
    expect(effects[0].startTime).toBeGreaterThan(first.startTime);
  });
});

describe('減速對怪物攻擊間隔生效', () => {
  const map = { width: 20, height: 20, tiles: [] } as unknown as MapData;

  function slowEffect(): ActiveEffect {
    return {
      id: 'debuff-slow-m1', sourceSkillId: 'ice-fog', sourceSkillName: '冰霧',
      category: 'slow', type: 'debuff', target: 'monster', targetIdx: 0, targetMonsterId: 'm1',
      modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }],
      startTime: NOW, duration: 6000, tags: ['slowed'], name: '減速', description: '',
    };
  }

  it('getMonsterDebuffModifierById 以 monsterId 取得攻速修正', () => {
    expect(getMonsterDebuffModifierById([slowEffect()], 'm1', 'attack_speed')).toBe(-30);
    expect(getMonsterDebuffModifierById([slowEffect()], 'm2', 'attack_speed')).toBe(0);
  });

  it('過期的減速不再生效', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 6000);
    expect(getMonsterDebuffModifierById([slowEffect()], 'm1', 'attack_speed')).toBe(0);
  });

  it('攻擊間隔由 1000ms 拉長為約 1428ms，怪物在原間隔內攻不出來', () => {
    const slowedInterval = Math.floor(1000 / 0.7);
    expect(slowedInterval).toBe(1428);

    const ctx = createMonsterCombatContext();
    ctx.state = 'attacking';
    const atOriginalInterval = tickMonsterCombat(
      ctx, { x: 1, y: 1 }, { x: 1, y: 1 },
      { attackType: 'melee', attackRange: 1.5, attackInterval: slowedInterval },
      map, 1000,
    );
    expect(atOriginalInterval.action).toBe('none');

    const afterSlowedInterval = tickMonsterCombat(
      ctx, { x: 1, y: 1 }, { x: 1, y: 1 },
      { attackType: 'melee', attackRange: 1.5, attackInterval: slowedInterval },
      map, 500,
    );
    expect(afterSlowedInterval.action).toBe('attack');
  });
});
