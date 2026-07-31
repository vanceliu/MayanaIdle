import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack } from '../arpgEventHandler';
import { useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
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

const NOW = 600_000;

function testCharacter(): Character {
  return {
    name: 'Priest', className: 'priest', level: 50, exp: 0, expToNext: 100,
    hp: 200, maxHp: 500, mp: 300, maxMp: 300,
    baseAttributes: { STR: 10, AGI: 10, VIT: 20, SPI: 25, INT: 20, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function castBuff(skillId: string) {
  const skill = { ...getSkillTemplate(skillId)!, lastUsedAt: 0 } as Skill;
  const gs = useGameStore.getState();
  useGameStore.setState({ skills: [skill] });
  return processPlayerAttack(
    { type: 'player_attack', action: { type: 'skill', skillId }, targetMonsterIds: [], skill },
    {
      character: gs.character!, equippedGear: [], activeEffects: gs.activeEffects,
      skills: [skill], monsterInstances: new Map(), mapMonsters: [] as unknown as MapMonster[],
    },
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  useGameStore.setState({
    character: testCharacter(),
    skills: [],
    equippedGear: {},
    activeEffects: [],
    combatLogs: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('持續回復（hotAmount）', () => {
  it('聖域施放後 buff 帶有每秒 20 的 HoT', () => {
    castBuff('sanctuary');

    const buff = useGameStore.getState().activeEffects.find(e => e.category === 'sanctuary');
    expect(buff).toBeDefined();
    expect(buff?.hot).toEqual({ amount: 20, interval: 1000 });
  });

  it('聖域同時帶有減傷 25% 與 HoT', () => {
    castBuff('sanctuary');
    const buff = useGameStore.getState().activeEffects.find(e => e.category === 'sanctuary')!;

    expect(buff.modifiers).toEqual([{ stat: 'damageReduction', value: 25, isPercent: true }]);
    expect(buff.hot?.amount).toBe(20);
  });

  it('沒有 hotAmount 的 buff 不帶 HoT', () => {
    castBuff('magic-armor');
    const buff = useGameStore.getState().activeEffects.find(e => e.category === 'defense-buff');
    expect(buff?.hot).toBeUndefined();
  });

  it('聖域與神聖領域同 category，後施放覆蓋前者', () => {
    castBuff('sanctuary');
    castBuff('holy-domain');

    const sanctuaryCategory = useGameStore.getState().activeEffects.filter(e => e.category === 'sanctuary');
    expect(sanctuaryCategory).toHaveLength(1);
    expect(sanctuaryCategory[0].sourceSkillId).toBe('holy-domain');
    // 神聖領域無 HoT
    expect(sanctuaryCategory[0].hot).toBeUndefined();
  });
});
