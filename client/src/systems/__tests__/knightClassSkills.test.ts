/**
 * 騎士職業魔法 5～7 級（`23-class-magic.md` § 23.3）：衝鋒突進、血濺咒殺、復仇之刃。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { attackSequence, processPlayerAttack } from '../arpgEventHandler';
import { evaluateCombatScript, type CombatScriptContext } from '../scriptRunner';
import { getEffectiveMaxHp, useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import { CLASS_SKILLS } from '../../models/classSkills';
import { isSkillHpBlocked, resolveSelfHpCost, type Skill } from '../../models/skill';
import { TileType, type MapData } from '../../models/mapControl';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { CombatRule } from '../../models/scriptEngine';
import type { MapMonster } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 70_000;

function knight(overrides: Partial<Character> = {}): Character {
  return {
    name: 'Knight', className: 'knight', level: 70, exp: 0, expToNext: 100,
    hp: 1000, maxHp: 1000, mp: 100, maxMp: 100,
    baseAttributes: { STR: 20, AGI: 12, VIT: 18, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
    ...overrides,
  };
}

function monster(hp = 99999): MonsterInstance {
  return {
    templateId: 5, name: '哥布林', level: 60, currentHp: hp, maxHp: 99999,
    attackMin: 10, attackMax: 10, defense: 0, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

const skillOf = (id: string): Skill => ({ ...getSkillTemplate(id)!, lastUsedAt: 0 });

function castBloodCurse(character: Character, monsters: Map<string, MonsterInstance>) {
  const skill = skillOf('blood-curse');
  useGameStore.setState({ character, skills: [skill], activeEffects: [], equippedGear: {}, combatLogs: [] });
  const mapMonsters = [...monsters.keys()].map((id, i) => ({ id, position: { x: i + 1, y: 0 }, isBoss: false })) as unknown as MapMonster[];
  return processPlayerAttack(
    { type: 'player_attack', action: { type: 'skill', skillId: 'blood-curse' }, targetMonsterIds: [...monsters.keys()], skill },
    { character, equippedGear: [], activeEffects: [], skills: [skill], monsterInstances: monsters, mapMonsters },
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('騎士 5～7 級定義', () => {
  const knightSkills = CLASS_SKILLS.filter(s => s.className === 'knight');

  it('職業魔法共 7 級，每 10 級一級', () => {
    expect(knightSkills.map(s => [s.classLevel, s.requiredLevel, s.id])).toEqual([
      [1, 10, 'shield-bash'], [2, 20, 'rend'], [3, 30, 'iron-shield'], [4, 40, 'taunt'],
      [5, 50, 'charge'], [6, 60, 'blood-curse'], [7, 70, 'vengeance'],
    ]);
  });

  it('衝鋒突進：MP 15、冷卻 10s、射程 8、40 ＋ 物理', () => {
    expect(getSkillTemplate('charge')).toMatchObject({
      power: 40, physicalSnapshot: true, mpCost: 15, cooldown: 10000, range: 8, dash: true,
    });
  });

  it('血濺咒殺：MP 0、冷卻 12s、暗屬性 40、扣 15%、4 格隨機 4 下、減速 10% 5s', () => {
    const skill = getSkillTemplate('blood-curse')!;
    expect(skill).toMatchObject({
      power: 40, element: 'dark', mpCost: 0, cooldown: 12000,
      aoeCenter: 'self', aoeRadius: 4, randomHits: 4, selfHpCostPercent: 15,
    });
    expect(skill.physicalSnapshot).toBeUndefined();
    expect(skill.physicalDamage).toBeUndefined();
    expect(skill.applyDebuff).toMatchObject({
      category: 'slow', duration: 5000, modifiers: [{ stat: 'attack_speed', value: -10, isPercent: true }],
    });
  });

  it('Lv60 學不到復仇之刃，Lv70 才能學', () => {
    const book = CLASS_SKILLS.find(s => s.id === 'vengeance')!.bookItemId;
    const bag = [{ itemId: book, amount: 1 }] as never;
    useGameStore.setState({ character: knight({ level: 60 }), skills: [], bagItems: bag });
    expect(useGameStore.getState().learnClassSkill('vengeance')).toBe(false);
    useGameStore.setState({ character: knight({ level: 70 }), skills: [], bagItems: bag });
    expect(useGameStore.getState().learnClassSkill('vengeance')).toBe(true);
  });
});

describe('自身 HP 消耗', () => {
  const skill = { selfHpCostPercent: 15 };

  it('扣有效最大 HP 的 15%（無條件捨去）', () => {
    expect(resolveSelfHpCost(skill, 1000, 1001)).toBe(150);
  });

  it('扣完最低留 1，不會致死', () => {
    expect(resolveSelfHpCost(skill, 100, 1000)).toBe(99);
  });

  it('HP 為 1 時不可施放，大於 1 可以', () => {
    expect(isSkillHpBlocked(skill, 1)).toBe(true);
    expect(isSkillHpBlocked(skill, 2)).toBe(false);
    expect(isSkillHpBlocked({}, 1)).toBe(false);
  });
});

describe('血濺咒殺結算', () => {
  it('先扣自身 HP，再打滿 4 下', () => {
    const character = knight();
    const maxHp = getEffectiveMaxHp(character, {}, []);
    const result = castBloodCurse(character, new Map([['m1', monster()], ['m2', monster()]]));
    expect(useGameStore.getState().character!.hp).toBe(character.hp - Math.floor(maxHp * 0.15));
    expect(result.damages).toHaveLength(4);
  });

  it('只有一隻怪時 4 下全打在牠身上', () => {
    const result = castBloodCurse(knight(), new Map([['m1', monster()]]));
    expect(result.damages.map(d => d.targetId)).toEqual(['m1', 'm1', 'm1', 'm1']);
  });

  it('附加減速 10%', () => {
    castBloodCurse(knight(), new Map([['m1', monster()]]));
    const slow = useGameStore.getState().activeEffects.filter(e => e.category === 'slow' && e.targetMonsterId === 'm1');
    expect(slow).toHaveLength(1);
    expect(slow[0].modifiers).toEqual([{ stat: 'attack_speed', value: -10, isPercent: true }]);
  });

  it('候選全死就提前結束', () => {
    const result = castBloodCurse(knight(), new Map([['m1', monster(1)]]));
    expect(result.damages).toHaveLength(1);
    expect(result.damages[0].killed).toBe(true);
  });
});

describe('attackSequence', () => {
  it('一般技能照目標清單順序', () => {
    expect([...attackSequence(['a', 'b'], {}, new Map())]).toEqual(['a', 'b']);
  });

  it('隨機多擊取後放回，跳過已死的', () => {
    const alive = new Map([['a', monster(0)], ['b', monster()]]);
    expect([...attackSequence(['a', 'b'], { randomHits: 3 }, alive)]).toEqual(['b', 'b', 'b']);
  });
});

describe('天賦選招', () => {
  const ground = TileType.Ground;
  const water = TileType.Water;
  const openMap: MapData = {
    id: 't', name: 't', width: 12, height: 3, spawnPoint: { x: 0, y: 0 },
    tiles: Array.from({ length: 3 }, () => Array(12).fill(ground)),
  };
  const moatMap: MapData = {
    ...openMap,
    tiles: Array.from({ length: 3 }, () => Array.from({ length: 12 }, (_, x) => (x === 3 ? water : ground))),
  };
  const rules = (skillId: string): CombatRule[] => [
    { id: 'r1', enabled: true, conditions: [{ type: 'always' }], action: { type: 'skill', skillId } },
    { id: 'r2', enabled: true, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
  ];
  const ctx = (skillId: string, overrides: Partial<CombatScriptContext> = {}): CombatScriptContext => ({
    character: knight(),
    monsters: [{ id: 'm1', instance: monster(), position: { x: 6, y: 1 } }],
    skills: [skillOf(skillId)],
    now: NOW,
    playerPos: { x: 0, y: 1 },
    primaryTargetId: 'm1',
    weaponRange: 1.5,
    map: openMap,
    ...overrides,
  });

  it('血濺咒殺在 HP 為 1 時跳過，落到下一條', () => {
    expect(evaluateCombatScript(rules('blood-curse'), ctx('blood-curse', { character: knight({ hp: 1 }) })))
      .toEqual({ type: 'normal_attack' });
    expect(evaluateCombatScript(rules('blood-curse'), ctx('blood-curse')))
      .toEqual({ type: 'skill', skillId: 'blood-curse' });
  });

  it('衝鋒突進在射程內且有落點時選上', () => {
    expect(evaluateCombatScript(rules('charge'), ctx('charge'))).toEqual({ type: 'skill', skillId: 'charge' });
  });

  it('衝鋒突進隔著水池沒有路時落到下一條', () => {
    expect(evaluateCombatScript(rules('charge'), ctx('charge', { map: moatMap }))).toEqual({ type: 'normal_attack' });
  });

  it('衝鋒突進在射程外照常選上（先追擊）', () => {
    const far = [{ id: 'm1', instance: monster(), position: { x: 10, y: 1 } }];
    expect(evaluateCombatScript(rules('charge'), ctx('charge', { map: moatMap, monsters: far })))
      .toEqual({ type: 'skill', skillId: 'charge' });
  });
});
