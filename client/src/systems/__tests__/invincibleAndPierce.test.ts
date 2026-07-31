import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calculateMonsterAttack, calculateSkillAttack, isPlayerInvincible } from '../combat';
import { processPlayerAttack } from '../arpgEventHandler';
import { useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';
import type { Skill } from '../../models/skill';
import type { MapMonster } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 700_000;

function character(): Character {
  return {
    name: 'Tester', className: 'elementalist', level: 50, exp: 0, expToNext: 100,
    hp: 400, maxHp: 400, mp: 300, maxMp: 300,
    baseAttributes: { STR: 10, AGI: 10, VIT: 15, SPI: 15, INT: 25, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function monster(defense = 0): MonsterInstance {
  return {
    templateId: 1, name: '哥布林', level: 40, currentHp: 9999, maxHp: 9999,
    attackMin: 100, attackMax: 100, defense, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function bow(): EquipmentInstance {
  return {
    templateId: 9, name: '短弓', type: 'bow', slot: 'rightHand', isTwoHanded: true,
    smallMonsterDamage: 30, largeMonsterDamage: 25, defense: 0, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function buffFrom(skillId: string): ActiveEffect {
  const t = getSkillTemplate(skillId)!;
  const e: ActiveEffect = {
    id: `buff-${skillId}`, sourceSkillId: skillId, sourceSkillName: t.name,
    category: t.buffCategory ?? skillId, type: 'buff', target: 'player',
    modifiers: t.buffModifiers ?? [],
    startTime: NOW, duration: t.buffDuration ?? 10_000,
    tags: [], name: t.name, description: '',
  };
  if (t.invincible) e.invincible = true;
  return e;
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('絕對屏障 — 無敵', () => {
  it('無敵期間怪物攻擊造成 0 傷害', () => {
    const result = calculateMonsterAttack(monster(), character(), [], [buffFrom('absolute-barrier')], 0);
    expect(result.damage).toBe(0);
    expect(result.log.message).toContain('無敵');
  });

  it('沒有無敵時照常受傷', () => {
    const result = calculateMonsterAttack(monster(), character(), [], [], 0);
    expect(result.damage).toBe(100);
  });

  it('無敵過期後恢復受傷', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 11_000);
    const result = calculateMonsterAttack(monster(), character(), [], [buffFrom('absolute-barrier')], 0);
    expect(result.damage).toBe(100);
  });

  it('isPlayerInvincible 只認角色身上未過期的無敵 buff', () => {
    const buff = buffFrom('absolute-barrier');
    expect(isPlayerInvincible([buff], NOW + 100)).toBe(true);
    expect(isPlayerInvincible([buff], NOW + 11_000)).toBe(false);
    expect(isPlayerInvincible([{ ...buff, target: 'monster' }], NOW + 100)).toBe(false);
  });

  it('施放後 buff 帶有 invincible 標記', () => {
    const skill = { ...getSkillTemplate('absolute-barrier')!, lastUsedAt: 0 } as Skill;
    useGameStore.setState({ character: character(), skills: [skill], equippedGear: {}, activeEffects: [], combatLogs: [] });
    processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId: 'absolute-barrier' }, targetMonsterIds: [], skill },
      {
        character: useGameStore.getState().character!, equippedGear: [], activeEffects: [],
        skills: [skill], monsterInstances: new Map(), mapMonsters: [] as unknown as MapMonster[],
      },
    );
    const buff = useGameStore.getState().activeEffects.find(e => e.sourceSkillId === 'absolute-barrier');
    expect(buff?.invincible).toBe(true);
  });
});

describe('穿透箭雨 — 無視 50% 防禦', () => {
  it('技能定義帶有 ignoreDefensePercent: 50', () => {
    expect(getSkillTemplate('arrow-rain')!.ignoreDefensePercent).toBe(50);
  });

  it('對高防禦目標傷害提升', () => {
    const char = character();
    const gear = [bow()];
    const target = monster(60); // 減傷 60%

    const normal = calculateSkillAttack(char, 50, 'none', target, gear, '穿透箭雨', [], 0, 0);
    const pierce = calculateSkillAttack(char, 50, 'none', target, gear, '穿透箭雨', [], 0, 50);

    // 減傷 60% → 30%
    expect(pierce.damage).toBeGreaterThan(normal.damage);
  });

  it('目標無防禦時無視防禦不影響傷害', () => {
    const char = character();
    const gear = [bow()];
    const normal = calculateSkillAttack(char, 50, 'none', monster(0), gear, '穿透箭雨', [], 0, 0);
    const pierce = calculateSkillAttack(char, 50, 'none', monster(0), gear, '穿透箭雨', [], 0, 50);
    expect(pierce.damage).toBe(normal.damage);
  });

  it('無視 100% 時完全忽略防禦', () => {
    const char = character();
    const gear = [bow()];
    const noDef = calculateSkillAttack(char, 50, 'none', monster(0), gear, 'X', [], 0, 0);
    const fullPierce = calculateSkillAttack(char, 50, 'none', monster(70), gear, 'X', [], 0, 100);
    expect(fullPierce.damage).toBe(noDef.damage);
  });
});
