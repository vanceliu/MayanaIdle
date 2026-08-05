import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import { useGameStore } from '../../stores/gameStore';
import type { MapMonster } from '../../stores/mapMonsterStore';
import { processPlayerAttack } from '../arpgEventHandler';

function createCharacter(overrides: Partial<Character> = {}): Character {
  return {
    userId: 1,
    name: '元素師',
    className: 'elementalist',
    level: 20,
    exp: 0,
    expToNext: 100,
    hp: 100,
    maxHp: 100,
    mp: 10,
    maxMp: 100,
    baseAttributes: { STR: 8, AGI: 8, VIT: 10, SPI: 14, INT: 18, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0,
    gold: 0,
    currentArea: 'ivory-tower-1f',
    currentZone: 'ivory-tower',
    currentRegion: 'ivory-tower',
    currentFloor: 1,
    skills: [],
    quests: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

function createMonster(): MonsterInstance {
  return {
    templateId: 1,
    name: '冰晶蝙蝠',
    level: 20,
    currentHp: 100,
    maxHp: 100,
    attackMin: 1,
    attackMax: 1,
    defense: 0,
    exp: 1,
    race: 'normal',
    size: 'small',
    element: 'none',
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1000,
  };
}

function createMapMonster(id: string): MapMonster {
  return {
    id,
    position: { x: 0, y: 0 },
    targetPosition: { x: 0, y: 0 },
    speed: 1,
    path: [],
    pathIndex: 0,
    pathRecalcTimer: 0,
    moveTimer: 0,
    lastPathPlayerPos: { x: 0, y: 0 },
    isBoss: false,
  };
}

describe('processPlayerAttack', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useGameStore.setState({ character: null, skills: [], equippedGear: {} });
  });

  it('restores MP equal to Mana Drain final damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const skill = instantiateFromTemplate('mana-drain', 0)!;
    const character = createCharacter({ skills: [skill] });
    const monster = createMonster();
    const monsterId = 'monster-1';

    useGameStore.setState({
      character,
      skills: [skill],
      equippedGear: {},
      activeEffects: [],
    });

    const result = processPlayerAttack(
      {
        type: 'player_attack',
        action: { type: 'skill', skillId: skill.id },
        targetMonsterIds: [monsterId],
        skill,
      },
      {
        character,
        equippedGear: [],
        activeEffects: [],
        skills: [skill],
        monsterInstances: new Map([[monsterId, monster]]),
        mapMonsters: [createMapMonster(monsterId)],
      },
    );

    // 魔力奪取威力 17（§ 23.5）+ INT 加成 floor(17 × (18/2 × 10%)) = 15
    // § 21.4：技能側 (17 + 15) × 0.5 = 16，未裝備武器 → 白字 0
    expect(result.damages[0].damage).toBe(16);
    expect(result.mpRestored).toBe(16);
    expect(useGameStore.getState().character!.mp).toBe(26);
    expect(result.logs).toContainEqual({ text: '魔力奪取 回復 16 MP', type: 'player' });
  });
});
