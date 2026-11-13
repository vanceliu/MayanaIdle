/**
 * 詞綴分類新增的三種詞綴（`07-affix.md` § 7.9）：普攻擴散、荊棘傷害、跑速。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack, processMonsterAttack } from '../../systems/arpgEventHandler';
import { getMoveSpeedMultiplier } from '../../systems/gameLoop';
import { calculatePlayerAttack, calculateSkillAttack, getElementDownPercent, getMonsterDebuffModifierById } from '../../systems/combat';
import { gameNow } from '../../core/clock';
import { DEFENSE_DOWN_CATEGORY, ELEMENT_DOWN_STAT, HIT_DOWN_CATEGORY, HIT_DOWN_STAT, elementDownCategory } from '../../models/affix';
import type { ActiveEffect } from '../../models/effect';
import { instantiateSkill, type Skill } from '../../models/skill';
import { useGameStore } from '../../stores/gameStore';
import { defaultSession } from '../../stores/session';
import type { Affix } from '../../models/affix';
import type { Ability } from '../../models/ability';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
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

const NOW = 900_000;

function knight(): Character {
  return {
    name: 'Tester', className: 'knight', level: 60, exp: 0, expToNext: 100,
    hp: 1000, maxHp: 1000, mp: 400, maxMp: 400,
    baseAttributes: { STR: 20, AGI: 0, VIT: 15, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function monster(over: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 12, name: '石像鬼', level: 60, currentHp: 99999, maxHp: 99999,
    attackMin: 60, attackMax: 60, defense: 20, exp: 200,
    race: 'demon', size: 'large', element: 'earth', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    ...over,
  };
}

function weapon(affixes: Affix[], type = 'sword'): EquipmentInstance {
  return {
    id: 1, templateId: 1019, name: '終焉之刃', type, slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 19, largeMonsterDamage: 18, quality: 0, enhancement: 0,
    affixes, ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function armor(slot: string, affixes: Affix[], over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    id: 2, templateId: 1, name: slot, type: 'armor', slot, isTwoHanded: false,
    quality: 0, enhancement: 0, affixes, ownerId: 1, equipped: true, ...over,
  } as EquipmentInstance;
}

/** m2 在主目標 2 格內、m3 在 4 格外 */
const POSITIONS: Record<string, { x: number; y: number }> = { m1: { x: 5, y: 5 }, m2: { x: 7, y: 5 }, m3: { x: 9, y: 5 } };

function attack(gear: EquipmentInstance[], targets: Record<string, MonsterInstance>, skill?: Skill) {
  const gs = useGameStore.getState();
  const mapMonsters = Object.keys(targets).map(id => ({ id, position: POSITIONS[id], isBoss: false })) as unknown as MapMonster[];
  return processPlayerAttack(
    {
      type: 'player_attack',
      action: skill ? { type: 'skill', skillId: skill.id } : { type: 'normal_attack' },
      targetMonsterIds: ['m1'],
      ...(skill ? { skill } : {}),
    },
    {
      character: gs.character!, equippedGear: gear, activeEffects: gs.activeEffects, skills: skill ? [skill] : [],
      monsterInstances: new Map(Object.entries(targets)), mapMonsters,
    },
  );
}

beforeEach(() => {
  useGameStore.setState({ character: knight(), skills: [], activeEffects: [], equippedGear: {} });
  defaultSession.loop.abilityCombo = undefined;
  defaultSession.loop.abilityFocus = undefined;
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('普攻擴散', () => {
  const splash = (value: number): Affix => ({ type: 'attack_splash', tier: 5, value });

  it('3 格內其他怪受主目標該下最終傷害 × X%，3 格外不受；必定命中、不爆擊', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = attack([weapon([splash(20)])], { m1: monster(), m2: monster(), m3: monster() });
    const [primary, ...others] = r.damages;
    expect(primary.targetId).toBe('m1');
    expect(others).toHaveLength(1);
    expect(others[0]).toMatchObject({ targetId: 'm2', damage: Math.floor(primary.hits[0].damage * 0.2), isCrit: false, isMiss: false, splash: true });
  });

  it('雙持一次攻擊兩下，各擴散一次', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = attack([weapon([splash(20)], 'dualBlade')], { m1: monster(), m2: monster() });
    const [primary, spread] = r.damages;
    expect(primary.hits).toHaveLength(2);
    expect(spread.hits.map(h => h.damage)).toEqual(primary.hits.map(h => Math.floor(h.damage * 0.2)));
    expect(spread.damage).toBe(spread.hits.reduce((s, h) => s + h.damage, 0));
  });

  it('武器與手套的 X 相加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = attack([weapon([splash(20)]), armor('gloves', [splash(10)])], { m1: monster(), m2: monster() });
    expect(r.damages[1].damage).toBe(Math.floor(r.damages[0].hits[0].damage * 0.3));
  });

  it('技能不觸發普攻擴散', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = attack([weapon([splash(20)])], { m1: monster(), m2: monster() }, instantiateSkill('ice-bolt')!);
    expect(r.damages.some(d => d.splash)).toBe(false);
  });

  it('主目標未命中不擴散', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const r = attack([weapon([splash(20)])], { m1: monster({ level: 200 }), m2: monster() });
    expect(r.damages[0].isMiss).toBe(true);
    expect(r.damages).toHaveLength(1);
  });
});

describe('荊棘傷害', () => {
  function hitBy(gear: EquipmentInstance[], target: MonsterInstance) {
    const gs = useGameStore.getState();
    return processMonsterAttack(
      { type: 'monster_attack', monsterId: 'm1', attackType: 'melee' } as never,
      {
        character: gs.character!, equippedGear: gear, activeEffects: gs.activeEffects, skills: [],
        monsterInstances: new Map([['m1', target]]),
        mapMonsters: [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[],
      },
    );
  }

  it('與飾品隨機技能荊棘反彈的 X 相加，合併成一次反彈', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const target = monster({ currentHp: 1000 });
    const shield = armor('leftHand', [{ type: 'thorns', tier: 3, value: 20 }], { type: 'shield' });
    const ring = armor('ring1', [], { ability: { type: 'thorns', params: { percent: 30 } } as Ability });
    const r = hitBy([shield, ring], target)!;
    expect(r.isDodged).toBe(false);
    expect(r.thorns!.damage).toBe(Math.floor(r.damage * 0.5));
    expect(target.currentHp).toBe(1000 - r.thorns!.damage);
  });

  it('只有荊棘傷害詞綴也會反彈', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const target = monster({ currentHp: 1000 });
    const r = hitBy([armor('leftHand', [{ type: 'thorns', tier: 3, value: 20 }], { type: 'shield' })], target)!;
    expect(r.thorns!.damage).toBe(Math.floor(r.damage * 0.2));
  });
});

describe('跑速', () => {
  it('移動速度 × (1 + X%)，X 吃品質', () => {
    useGameStore.setState({ equippedGear: { boots: armor('boots', [{ type: 'move_speed', tier: 5, value: 10 }], { quality: 20 }) } });
    expect(getMoveSpeedMultiplier(defaultSession)).toBeCloseTo(1.12);
  });

  it('沒有跑速詞綴時倍率為 1', () => {
    useGameStore.setState({ equippedGear: { boots: armor('boots', []) } });
    expect(getMoveSpeedMultiplier(defaultSession)).toBe(1);
  });

  it('素質需求未滿足的件詞綴凍結，不計跑速', () => {
    useGameStore.setState({
      equippedGear: { boots: armor('boots', [{ type: 'move_speed', tier: 5, value: 10 }], { requiredAttributes: { STR: 999 } }) },
    });
    expect(getMoveSpeedMultiplier(defaultSession)).toBe(1);
  });
});

describe('元素下降', () => {
  const fireDown = (value = 15): Affix => ({ type: 'element_down', tier: 5, value, element: 'fire' });
  const fireBrand: Affix = { type: 'element_brand', tier: 3, value: 10, element: 'fire' };

  function downEffect(element: string, value: number, startTime = gameNow(), monsterId = 'm1'): ActiveEffect {
    return {
      id: `debuff-${elementDownCategory(element)}-${monsterId}-${startTime}`,
      sourceSkillId: 'element_down', sourceSkillName: '元素下降',
      category: elementDownCategory(element), type: 'debuff', target: 'monster',
      targetIdx: 0, targetMonsterId: monsterId,
      modifiers: [{ stat: ELEMENT_DOWN_STAT, value, isPercent: true }],
      startTime, duration: 3000, tags: [], name: '元素下降', description: '',
    };
  }

  const swing = (affixes: Affix[], effects: ActiveEffect[]) =>
    calculatePlayerAttack(knight(), weapon(affixes), monster(), [weapon(affixes)], effects, 0, 'm1').damage;

  it('命中後 10% 機率施加 3 秒的該元素下降，X 吃品質', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    attack([weapon([fireDown(15)])], { m1: monster() });
    const applied = useGameStore.getState().activeEffects.filter(e => e.category === elementDownCategory('fire'));
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({ target: 'monster', targetMonsterId: 'm1', duration: 3000 });
    expect(applied[0].modifiers).toEqual([{ stat: ELEMENT_DOWN_STAT, value: 15, isPercent: true }]);
  });

  it('同元素再觸發覆蓋並刷新，不疊兩筆', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    attack([weapon([fireDown(15)])], { m1: monster() });
    attack([weapon([fireDown(15)])], { m1: monster() });
    expect(useGameStore.getState().activeEffects.filter(e => e.category === elementDownCategory('fire'))).toHaveLength(1);
  });

  it('普攻：同元素加算進普攻元素乘區；不同元素、無屬性不加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = swing([fireBrand], []);
    expect(swing([fireBrand], [downEffect('fire', 15)])).toBeGreaterThan(base);
    expect(swing([fireBrand], [downEffect('ice', 15)])).toBe(base);
    const plain = swing([], []);
    expect(swing([], [downEffect('fire', 15)])).toBe(plain);
  });

  it('技能：同元素加算進技能元素乘區；無屬性技能不加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const cast = (element: string, effects: ActiveEffect[]) =>
      calculateSkillAttack(knight(), 30, element, monster(), [], '技能', effects, 0, 0, 'm1').damage;
    expect(cast('fire', [downEffect('fire', 20)])).toBeGreaterThan(cast('fire', []));
    expect(cast('ice', [downEffect('fire', 20)])).toBe(cast('ice', []));
    expect(cast('none', [downEffect('fire', 20)])).toBe(cast('none', []));
  });

  it('隊友施加的元素下降併入傷害計算', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const gs = useGameStore.getState();
    const strike = (partyAffixDebuffs: ActiveEffect[]) => processPlayerAttack(
      { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: ['m1'] },
      {
        character: gs.character!, equippedGear: [weapon([fireBrand])], activeEffects: [], skills: [],
        monsterInstances: new Map([['m1', monster()]]),
        mapMonsters: [{ id: 'm1', position: POSITIONS.m1, isBoss: false }] as unknown as MapMonster[],
        partyAffixDebuffs,
      },
    ).damages[0].damage;
    expect(strike([downEffect('fire', 15)])).toBeGreaterThan(strike([]));
  });

  it('同元素有多筆時以最後施放的為準', () => {
    const now = gameNow();
    const effects = [downEffect('fire', 20, now - 1000), downEffect('fire', 5, now)];
    expect(getElementDownPercent(effects, 'm1', 'fire')).toBe(5);
    expect(getElementDownPercent(effects, 'm2', 'fire')).toBe(0);
    expect(getElementDownPercent([downEffect('fire', 20, now - 5000)], 'm1', 'fire')).toBe(0);
  });
});

describe('命中下降／防禦下降全隊共用（`07-affix.md` § 7.9）', () => {
  function debuff(category: string, stat: string, value: number, startTime = gameNow()): ActiveEffect {
    return {
      id: `debuff-${category}-m1-${startTime}`, sourceSkillId: category, sourceSkillName: category,
      category, type: 'debuff', target: 'monster', targetIdx: 0, targetMonsterId: 'm1',
      modifiers: [{ stat, value, isPercent: true }], startTime, duration: 3000, tags: [], name: category, description: '',
    };
  }

  it('同 category 只取最後施放的一筆；技能的防禦下降照常加算', () => {
    const now = gameNow();
    const curse = { ...debuff('curse', 'defense', -20), id: 'curse' };
    const effects = [debuff(DEFENSE_DOWN_CATEGORY, 'defense', -10, now - 500), debuff(DEFENSE_DOWN_CATEGORY, 'defense', -15, now), curse];
    expect(getMonsterDebuffModifierById(effects, 'm1', 'defense')).toBe(-35);
  });

  it('隊友施加的防禦下降併入自己的傷害計算', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const gs = useGameStore.getState();
    const strike = (partyAffixDebuffs: ActiveEffect[]) => processPlayerAttack(
      { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: ['m1'] },
      {
        character: gs.character!, equippedGear: [weapon([])], activeEffects: [], skills: [],
        monsterInstances: new Map([['m1', monster({ defense: 60 })]]),
        mapMonsters: [{ id: 'm1', position: POSITIONS.m1, isBoss: false }] as unknown as MapMonster[],
        partyAffixDebuffs,
      },
    ).damages[0].damage;
    expect(strike([debuff(DEFENSE_DOWN_CATEGORY, 'defense', -20)])).toBeGreaterThan(strike([]));
  });

  it('隊友施加的命中下降讓被該怪攻擊的自己更容易迴避', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const gs = useGameStore.getState();
    const hit = (partyAffixDebuffs: ActiveEffect[]) => processMonsterAttack(
      { type: 'monster_attack', monsterId: 'm1', attackType: 'melee' } as never,
      {
        character: gs.character!, equippedGear: [], activeEffects: [], skills: [],
        monsterInstances: new Map([['m1', monster({ currentHp: 1000 })]]),
        mapMonsters: [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[],
        partyAffixDebuffs,
      },
    )!;
    expect(hit([]).isDodged).toBe(false);
    expect(hit([debuff(HIT_DOWN_CATEGORY, HIT_DOWN_STAT, -60)]).isDodged).toBe(true);
  });
});
