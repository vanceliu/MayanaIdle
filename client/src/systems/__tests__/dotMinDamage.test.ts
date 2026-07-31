import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack } from '../arpgEventHandler';
import { calculateBasePhysicalDamage } from '../combat';
import { useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
import type { ActiveEffect } from '../../models/effect';
import type { EquipmentInstance } from '../../models/equipment';
import type { MapMonster } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 300_000;

function testCharacter(str: number): Character {
  return {
    name: 'Tester', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp: 300, maxHp: 300, mp: 200, maxMp: 200,
    baseAttributes: { STR: str, AGI: 20, VIT: 15, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function target(): MonsterInstance {
  return {
    templateId: 12, name: '石像鬼', level: 22, currentHp: 99999, maxHp: 99999,
    attackMin: 15, attackMax: 22, defense: 0, exp: 200,
    race: 'demon', size: 'large', element: 'earth', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function sword(): EquipmentInstance {
  return {
    templateId: 2, name: '長劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 30, largeMonsterDamage: 26, defense: 0, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function envenomBuff(): ActiveEffect {
  return {
    id: 'buff-envenom', sourceSkillId: 'envenom', sourceSkillName: '淬毒',
    category: 'poison-enchant', type: 'buff', target: 'player',
    startTime: NOW, duration: 300_000, tags: [], name: '淬毒', description: '',
  };
}

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

function castRend(gear: EquipmentInstance[], monster: MonsterInstance) {
  const skill = { ...getSkillTemplate('rend')!, lastUsedAt: 0 } as Skill;
  const gs = useGameStore.getState();
  useGameStore.setState({ skills: [skill] });
  return processPlayerAttack(
    { type: 'player_attack', action: { type: 'skill', skillId: 'rend' }, targetMonsterIds: ['m1'], skill },
    {
      character: gs.character!, equippedGear: gear,
      activeEffects: useGameStore.getState().activeEffects, skills: [skill],
      monsterInstances: new Map([['m1', monster]]), mapMonsters,
    },
  );
}

function normalAttack(gear: EquipmentInstance[], monster: MonsterInstance) {
  const gs = useGameStore.getState();
  return processPlayerAttack(
    { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: ['m1'] },
    {
      character: gs.character!, equippedGear: gear,
      activeEffects: useGameStore.getState().activeEffects, skills: [],
      monsterInstances: new Map([['m1', monster]]), mapMonsters,
    },
  );
}

const dotDamageOf = (category: string) =>
  useGameStore.getState().activeEffects.find(
    e => e.type === 'debuff' && e.target === 'monster' && e.category === category
  )?.dot?.damage;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  useGameStore.setState({
    character: testCharacter(20),
    skills: [],
    equippedGear: {},
    combatLogs: [],
    activeEffects: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('裂傷斬 — 流血 DoT 快照（§ 23.3 / § 24.4.5）', () => {
  it('DoT 傷害為角色物理傷害的 50%（快照制）', () => {
    const gear = [sword()];
    const char = testCharacter(20);
    useGameStore.setState({ character: char });
    const expected = Math.floor(calculateBasePhysicalDamage(char, gear[0], gear, []) * 0.5);
    expect(expected).toBeGreaterThan(1); // 確保這條測的是公式而非最低值

    castRend(gear, target());
    expect(dotDamageOf('bleeding')).toBe(expected);
  });

  it('物理傷害極低時 DoT 仍至少 1 點', () => {
    const char = testCharacter(1);
    useGameStore.setState({ character: char });
    expect(calculateBasePhysicalDamage(char, null, [], [])).toBe(1);

    castRend([], target());
    expect(dotDamageOf('bleeding')).toBe(1);
  });

  it('施加日誌不會顯示每秒 0 傷害', () => {
    const char = testCharacter(1);
    useGameStore.setState({ character: char });
    const result = castRend([], target());
    const log = result.logs.find(l => l.text.includes('流血'));
    expect(log?.text).toContain('每秒 1');
  });
});

describe('淬毒 — 中毒 DoT 快照（§ 23.7 / § 24.4.5）', () => {
  it('DoT 傷害為角色物理傷害的 30%（快照制）', () => {
    const gear = [sword()];
    const char = testCharacter(20);
    useGameStore.setState({ character: char, activeEffects: [envenomBuff()] });
    const expected = Math.floor(
      calculateBasePhysicalDamage(char, gear[0], gear, [envenomBuff()]) * 0.3
    );
    expect(expected).toBeGreaterThan(1);

    normalAttack(gear, target());
    expect(dotDamageOf('poisoned')).toBe(expected);
  });

  it('物理傷害極低時 DoT 仍至少 1 點', () => {
    const char = testCharacter(1);
    useGameStore.setState({ character: char, activeEffects: [envenomBuff()] });
    expect(calculateBasePhysicalDamage(char, null, [], [envenomBuff()])).toBe(1);

    const result = normalAttack([], target());
    expect(dotDamageOf('poisoned')).toBe(1);
    expect(result.logs.find(l => l.text.includes('淬毒觸發'))?.text).toContain('每秒 1');
  });
});
