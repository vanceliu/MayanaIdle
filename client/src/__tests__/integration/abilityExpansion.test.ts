/**
 * 隨機技能擴充的戰鬥整合測試（`07-affix-ability.md` § 7S.4／§ 7S.5）。
 *
 *  - 屍爆：被擊殺怪 3 格內其他怪受最大 HP × X%；屍爆擊殺不連鎖；荊棘擊殺同樣觸發
 *  - 擊殺縮冷：冷卻中技能每擊殺一隻 −X 秒，最多縮到冷卻結束
 *  - 凍結打擊：命中觸發減速（攻擊速度 −30%、5 秒），同 category 覆蓋
 *  - 閃避回復：迴避成功（含絕對迴避）回 HP，多件取最大
 *  - 逆境：身上每種 debuff（依 tag）buff 減傷 +X%，多件取最大
 *  - 挑釁怒吼擴散、強化冷卻縮減強化
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack, processMonsterAttack } from '../../systems/arpgEventHandler';
import { getBuffDamageReduction, getSkillCooldownReduction } from '../../systems/combat';
import type { Ability } from '../../models/ability';
import { instantiateSkill, type Skill } from '../../models/skill';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import { applyAbilityToSkill } from '../../models/abilitySkill';
import { useGameStore } from '../../stores/gameStore';
import { defaultSession } from '../../stores/session';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
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

const NOW = 900_000;

function character(className: Character['className'] = 'knight'): Character {
  return {
    name: 'Tester', className, level: 60, exp: 0, expToNext: 100,
    hp: 100, maxHp: 1000, mp: 400, maxMp: 400,
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

function weapon(ability?: Ability): EquipmentInstance {
  return {
    id: 1, templateId: 1019, name: '終焉之刃', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 19, largeMonsterDamage: 18, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true, ...(ability ? { ability } : {}),
  } as EquipmentInstance;
}

function ring(ability: Ability, slot = 'ring1'): EquipmentInstance {
  return { id: 50, templateId: 1, name: '戒指', type: 'armor', slot, isTwoHanded: false, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ability } as EquipmentInstance;
}

/** m1 與 m2 相距 2 格、m2 與 m3 相距 2 格、m1 與 m3 相距 4 格 */
const POSITIONS: Record<string, { x: number; y: number }> = { m1: { x: 5, y: 5 }, m2: { x: 7, y: 5 }, m3: { x: 9, y: 5 } };
const mapOf = (targets: Record<string, MonsterInstance>) =>
  Object.keys(targets).map(id => ({ id, position: POSITIONS[id], isBoss: false })) as unknown as MapMonster[];

function run(gear: EquipmentInstance[], targets: Record<string, MonsterInstance>, baseSkill?: Skill) {
  const gs = useGameStore.getState();
  const skill = baseSkill && applyAbilityToSkill(baseSkill, gear, gs.character!.className);
  return processPlayerAttack(
    {
      type: 'player_attack',
      action: skill ? { type: 'skill', skillId: skill.id } : { type: 'normal_attack' },
      targetMonsterIds: ['m1'],
      ...(skill ? { skill } : {}),
    },
    {
      character: gs.character!, equippedGear: gear, activeEffects: gs.activeEffects, skills: skill ? [skill] : [],
      monsterInstances: new Map(Object.entries(targets)), mapMonsters: mapOf(targets),
    },
  );
}

function hitBy(gear: EquipmentInstance[], targets: Record<string, MonsterInstance>) {
  const gs = useGameStore.getState();
  return processMonsterAttack(
    { type: 'monster_attack', monsterId: 'm1', attackType: 'melee' } as never,
    {
      character: gs.character!, equippedGear: gear, activeEffects: gs.activeEffects, skills: [],
      monsterInstances: new Map(Object.entries(targets)), mapMonsters: mapOf(targets),
    },
  )!;
}

const monsterEffects = (category: string, id: string) =>
  useGameStore.getState().activeEffects.filter(e => e.category === category && e.targetMonsterId === id);

function playerDebuff(tag: string, over: Partial<ActiveEffect> = {}): ActiveEffect {
  return {
    id: `d-${tag}`, sourceSkillId: 'x', sourceSkillName: 'x', category: tag, type: 'debuff', target: 'player',
    startTime: NOW, duration: 5000, tags: [tag], name: tag, description: '', ...over,
  };
}

beforeEach(() => {
  useGameStore.setState({ character: character(), skills: [], activeEffects: [], equippedGear: {} });
  defaultSession.loop.abilityCombo = undefined;
  defaultSession.loop.abilityFocus = undefined;
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('屍爆', () => {
  const explosion = weapon({ type: 'corpse_explosion', params: { percent: 5 } });

  it('擊殺時 3 格內其他怪受被擊殺怪最大 HP × X%；範圍外不受', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const targets = { m1: monster({ currentHp: 1, maxHp: 2000 }), m2: monster(), m3: monster() };
    const r = run([explosion], targets);
    expect(r.damages[0].killed).toBe(true);
    const blast = r.damages.find(d => d.targetId === 'm2')!;
    expect(blast).toMatchObject({ damage: 100, splash: true });
    expect(targets.m2.currentHp).toBe(99999 - 100);
    expect(targets.m3.currentHp).toBe(99999);
  });

  it('屍爆的擊殺不再爆開', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const targets = { m1: monster({ currentHp: 1, maxHp: 2000 }), m2: monster({ currentHp: 50, maxHp: 99999 }), m3: monster() };
    const r = run([explosion], targets);
    expect(r.damages.find(d => d.targetId === 'm2')!.killed).toBe(true);
    expect(targets.m3.currentHp).toBe(99999);
  });

  it('沒有擊殺不觸發', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const targets = { m1: monster(), m2: monster() };
    run([explosion], targets);
    expect(targets.m2.currentHp).toBe(99999);
  });

  it('荊棘反彈的擊殺同樣觸發', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    useGameStore.setState({ character: { ...character(), hp: 1000 } });
    const targets = { m1: monster({ currentHp: 1, maxHp: 2000 }), m2: monster() };
    const r = hitBy([explosion, ring({ type: 'thorns', params: { percent: 60 } })], targets);
    expect(r.thorns?.killed).toBe(true);
    expect(r.explosionDamages).toHaveLength(1);
    expect(targets.m2.currentHp).toBe(99999 - 100);
  });
});

describe('擊殺縮冷', () => {
  const effectiveCooldown = (skill: Skill) => {
    const cdr = getSkillCooldownReduction(useGameStore.getState().character!, [], []);
    return Math.floor(skill.cooldown * (1 - Math.min(cdr, 50) / 100));
  };

  it('冷卻中技能每擊殺一隻 −X 秒', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const bolt = { ...instantiateSkill('ice-bolt')!, cooldown: 60_000, lastUsedAt: NOW - 1000 };
    useGameStore.setState({ skills: [bolt] });
    const targets = { m1: monster({ currentHp: 1, maxHp: 2000 }), m2: monster({ currentHp: 1 }) };
    run([weapon({ type: 'kill_cooldown', params: { cooldown: 2500 } })], targets);
    expect(useGameStore.getState().skills[0].lastUsedAt).toBe(bolt.lastUsedAt - 2500);
  });

  it('屍爆的擊殺也計入；最多縮到冷卻結束', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const bolt = { ...instantiateSkill('ice-bolt')!, cooldown: 60_000, lastUsedAt: NOW - 1000 };
    const short = { ...instantiateSkill('fireball')!, lastUsedAt: NOW - 1000 };
    useGameStore.setState({ skills: [bolt, short] });
    const targets = { m1: monster({ currentHp: 1, maxHp: 2000 }), m2: monster({ currentHp: 1 }) };
    const gear = [{ ...weapon({ type: 'kill_cooldown', params: { cooldown: 2500 } }) }, { ...weapon({ type: 'corpse_explosion', params: { percent: 5 } }), id: 2 }];
    run(gear, targets);
    const [boltAfter, shortAfter] = useGameStore.getState().skills;
    expect(boltAfter.lastUsedAt).toBe(bolt.lastUsedAt - 5000);
    const remaining = short.lastUsedAt + effectiveCooldown(short) - NOW;
    expect(shortAfter.lastUsedAt).toBe(short.lastUsedAt - Math.min(remaining, 5000));
  });
});

describe('凍結打擊', () => {
  const freezing = weapon({ type: 'freezing_strike', params: { chance: 10 } });

  it('擲中時目標減速：攻擊速度 −30%、5 秒、tag slowed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    run([freezing], { m1: monster() });
    const [slow] = monsterEffects('slow', 'm1');
    expect(slow).toMatchObject({ duration: 5000, tags: ['slowed'], modifiers: [{ stat: 'attack_speed', value: -30, isPercent: true }] });
  });

  it('沒擲中不施加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    run([freezing], { m1: monster() });
    expect(monsterEffects('slow', 'm1')).toHaveLength(0);
  });

  it('同 category 後施放覆蓋', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const old: ActiveEffect = {
      id: 'old', sourceSkillId: 'blood-curse', sourceSkillName: '血濺咒殺', category: 'slow', type: 'debuff', target: 'monster',
      targetMonsterId: 'm1', modifiers: [{ stat: 'attack_speed', value: -10, isPercent: true }], startTime: NOW - 1000, duration: 5000,
      tags: ['slowed'], name: '減速', description: '',
    };
    useGameStore.setState({ activeEffects: [old] });
    run([freezing], { m1: monster() });
    const slows = monsterEffects('slow', 'm1');
    expect(slows).toHaveLength(1);
    expect(slows[0].modifiers![0].value).toBe(-30);
  });
});

describe('閃避回復', () => {
  it('絕對迴避時回 HP，多件取最大', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const smoke: ActiveEffect = {
      id: 'smoke', sourceSkillId: 'smoke-bomb', sourceSkillName: '煙霧彈', category: 'smoke', type: 'buff', target: 'player',
      startTime: NOW, duration: 10_000, tags: [], name: '煙霧彈', description: '', evadeCharges: 1,
    };
    useGameStore.setState({ activeEffects: [smoke] });
    const gear = [ring({ type: 'dodge_heal', params: { heal: 30 } }), ring({ type: 'dodge_heal', params: { heal: 45 } }, 'ring2')];
    const r = hitBy(gear, { m1: monster() });
    expect(r.isDodged).toBe(true);
    expect(useGameStore.getState().character!.hp).toBe(145);
  });

  it('被命中不回', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    useGameStore.setState({ character: { ...character(), hp: 1000 } });
    const r = hitBy([ring({ type: 'dodge_heal', params: { heal: 30 } })], { m1: monster() });
    expect(r.isDodged).toBe(false);
    expect(useGameStore.getState().character!.hp).toBe(1000 - r.damage);
  });
});

describe('逆境', () => {
  const gear = [ring({ type: 'adversity', params: { reduction: 3 } }), ring({ type: 'adversity', params: { reduction: 5 } }, 'ring2')];

  it('每種 debuff（依 tag）× X%，多件取最大；同種只算一次', () => {
    const effects = [playerDebuff('poisoned'), { ...playerDebuff('poisoned'), id: 'p2' }, playerDebuff('cursed')];
    expect(getBuffDamageReduction(effects, gear)).toBe(10);
    expect(getBuffDamageReduction(effects)).toBe(0);
  });

  it('過期的、怪物身上的、不在清單的不算', () => {
    const effects = [
      playerDebuff('poisoned', { startTime: NOW - 6000 }),
      playerDebuff('slowed', { target: 'monster' }),
      playerDebuff('rooted'),
    ];
    expect(getBuffDamageReduction(effects, gear)).toBe(0);
  });

  it('與其他 buff 減傷加算，上限 100', () => {
    const shield: ActiveEffect = {
      id: 'iron', sourceSkillId: 'iron-shield', sourceSkillName: '鋼鐵護盾', category: 'iron-shield', type: 'buff', target: 'player',
      modifiers: [{ stat: 'damageReduction', value: 40, isPercent: true }], startTime: NOW, duration: 15_000, tags: [], name: '鋼鐵護盾', description: '',
    };
    expect(getBuffDamageReduction([shield, playerDebuff('stunned')], gear)).toBe(45);
    const all = ['poisoned', 'bleeding', 'cursed', 'weakened', 'slowed', 'stunned', 'silenced'].map(t => playerDebuff(t));
    expect(getBuffDamageReduction([shield, ...all], gear)).toBe(75);
    expect(getBuffDamageReduction([{ ...shield, id: 'iron2' }, shield, ...all], gear)).toBe(100);
  });
});

describe('職業飾品池', () => {
  it('挑釁怒吼擴散：主目標 3 格內同時掛挑釁，範圍外不掛', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const taunt = instantiateFromTemplate('taunt')!;
    useGameStore.setState({ skills: [taunt] });
    run([weapon(), ring({ type: 'taunt_spread', params: {} })], { m1: monster(), m2: monster(), m3: monster() }, taunt);
    expect(monsterEffects('atk-down', 'm1')).toHaveLength(1);
    expect(monsterEffects('atk-down', 'm2')).toHaveLength(1);
    expect(monsterEffects('atk-down', 'm3')).toHaveLength(0);
  });

  it('沒有挑釁怒吼擴散只掛主目標', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const taunt = instantiateFromTemplate('taunt')!;
    run([weapon()], { m1: monster(), m2: monster() }, taunt);
    expect(monsterEffects('atk-down', 'm2')).toHaveLength(0);
  });

  it('強化冷卻縮減強化：持續 180 秒，其他不變；職業不符無效', () => {
    const cdr = instantiateFromTemplate('greater-cd-reduce')!;
    const gear = [ring({ type: 'greater_cd_reduce_boost', params: {} })];
    const boosted = applyAbilityToSkill(cdr, gear, 'elementalist');
    expect(boosted).toMatchObject({ buffDuration: 180_000, cooldown: cdr.cooldown, mpCost: cdr.mpCost, buffModifiers: cdr.buffModifiers });
    expect(applyAbilityToSkill(cdr, gear, 'knight').buffDuration).toBe(cdr.buffDuration);
  });
});
