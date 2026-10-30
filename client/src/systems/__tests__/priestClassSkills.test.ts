/**
 * 牧師職業魔法 5～7 級（`23-class-magic.md` § 23.6）：血魔轉換、神聖懲擊、神聖領域。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack } from '../arpgEventHandler';
import { getMpRegen } from '../regen';
import { getEffectiveMaxHp, getEffectiveMaxMp, useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import { CLASS_SKILLS } from '../../models/classSkills';
import { resolveMpAfterSelfCast, type Skill } from '../../models/skill';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { MapMonster } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 900_000;

function priest(overrides: Partial<Character> = {}): Character {
  return {
    name: 'Priest', className: 'priest', level: 70, exp: 0, expToNext: 100,
    hp: 600, maxHp: 600, mp: 100, maxMp: 400,
    baseAttributes: { STR: 10, AGI: 10, VIT: 18, SPI: 22, INT: 25, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
    ...overrides,
  };
}

const skillOf = (id: string): Skill => ({ ...getSkillTemplate(id)!, lastUsedAt: 0 });

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  useGameStore.setState({ character: priest(), skills: [], equippedGear: {}, activeEffects: [], combatLogs: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('牧師 5～7 級定義', () => {
  it('職業魔法共 7 級，神聖領域移到 7 級', () => {
    expect(CLASS_SKILLS.filter(s => s.className === 'priest').map(s => [s.classLevel, s.requiredLevel, s.id])).toEqual([
      [1, 10, 'holy-shield'], [2, 20, 'high-heal'], [3, 30, 'group-heal'], [4, 40, 'holy-judgment'],
      [5, 50, 'blood-mana'], [6, 60, 'holy-smite'], [7, 70, 'holy-domain'],
    ]);
  });

  it('血魔轉換：MP 0、冷卻 10s、HP 20% → MP 20%', () => {
    expect(getSkillTemplate('blood-mana')).toMatchObject({
      type: 'buff', mpCost: 0, cooldown: 10000, selfHpCostPercent: 20, mpRestorePercent: 20,
    });
    expect(getSkillTemplate('blood-mana')!.buffDuration).toBeUndefined();
  });

  it('神聖懲擊：光屬性、技能攻擊力 53、MP 30、冷卻 10s、射程 10、單體、吸血 30%', () => {
    expect(getSkillTemplate('holy-smite')).toMatchObject({
      type: 'attack', target: 'single', element: 'light', power: 53, mpCost: 30, cooldown: 10000, range: 10, lifestealPercent: 30,
    });
  });
});

describe('精神匯聚（取代高階治癒，沿用 id high-heal）', () => {
  it('MP 10、冷卻 60s、持續 300s、每次回魔另加最大 MP 5%', () => {
    expect(getSkillTemplate('high-heal')).toMatchObject({
      name: '精神匯聚', type: 'buff', mpCost: 10, cooldown: 60000, buffDuration: 300000, buffCategory: 'spirit-gathering',
      buffModifiers: [{ stat: 'mp_regen_max_percent', value: 5, isPercent: true }],
    });
  });

  it('回魔加成為有效最大 MP 5%，戰鬥中不減半', () => {
    const char = priest();
    const t = getSkillTemplate('high-heal')!;
    const buff = [{
      id: 'b', sourceSkillId: 'high-heal', sourceSkillName: t.name, category: t.buffCategory!, type: 'buff' as const,
      target: 'player' as const, modifiers: t.buffModifiers, startTime: NOW, duration: t.buffDuration!, tags: [], name: t.name, description: '',
    }];
    const bonus = Math.floor(getEffectiveMaxMp(char, {}, []) * 0.05);
    expect(getMpRegen(char, true, [], buff) - getMpRegen(char, true, [], [])).toBe(bonus);
  });
});

describe('血魔轉換', () => {
  it('扣有效最大 HP 20%，回復有效最大 MP 20%', () => {
    const char = priest();
    useGameStore.setState({ character: char, skills: [skillOf('blood-mana')] });
    const maxHp = getEffectiveMaxHp(char, {}, []);
    const maxMp = getEffectiveMaxMp(char, {}, []);
    expect(useGameStore.getState().castSelfSkill('blood-mana')).toBe(true);
    const after = useGameStore.getState().character!;
    expect(after.hp).toBe(600 - Math.floor(maxHp * 0.2));
    expect(after.mp).toBe(100 + Math.floor(maxMp * 0.2));
  });

  it('回復的 MP 不超過上限', () => {
    expect(resolveMpAfterSelfCast({ mpCost: 0, mpRestorePercent: 10 }, 395, 400)).toBe(400);
  });

  it('HP 為 1 時不可施放', () => {
    useGameStore.setState({ character: priest({ hp: 1 }), skills: [skillOf('blood-mana')] });
    expect(useGameStore.getState().castSelfSkill('blood-mana')).toBe(false);
  });

  it('不掛任何 buff', () => {
    useGameStore.setState({ character: priest(), skills: [skillOf('blood-mana')] });
    useGameStore.getState().castSelfSkill('blood-mana');
    expect(useGameStore.getState().activeEffects).toEqual([]);
  });
});

describe('神聖懲擊', () => {
  it('回復最終傷害 30% 的 HP', () => {
    const skill = skillOf('holy-smite');
    const character = priest({ hp: 300 });
    const target: MonsterInstance = {
      templateId: 5, name: '哥布林', level: 60, currentHp: 99999, maxHp: 99999,
      attackMin: 10, attackMax: 10, defense: 0, exp: 50,
      race: 'normal', size: 'small', element: 'none', isBoss: false,
      attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    };
    useGameStore.setState({ character, skills: [skill], activeEffects: [], equippedGear: {}, combatLogs: [] });
    const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];
    const r = processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId: 'holy-smite' }, targetMonsterIds: ['m1'], skill },
      { character, equippedGear: [], activeEffects: [], skills: [skill], monsterInstances: new Map([['m1', target]]), mapMonsters },
    );
    const dealt = r.damages[0].damage;
    expect(dealt).toBeGreaterThan(0);
    expect(r.damages[0].isCrit).toBe(false);
    expect(r.hpRestored).toBe(Math.floor(dealt * 0.3));
    expect(useGameStore.getState().character!.hp).toBe(300 + Math.floor(dealt * 0.3));
  });
});
