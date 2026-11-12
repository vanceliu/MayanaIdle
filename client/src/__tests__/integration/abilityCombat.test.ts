/**
 * 隨機技能共通池的戰鬥整合測試 —— 走 `processPlayerAttack`（`07-affix-ability.md` § 7S.4／§ 7S.5）。
 *
 *  - 追加傷害：每下命中各擲一次，加在最終傷害
 *  - 追打：普攻類每一下計 1、技能類每施放一次計 1；換武器或重新進圖歸零
 *  - 專注打擊：同一隻怪逐下加層，結算後才加；上限 +100%；換地圖清除、怪死清除
 *  - 單體技能擴散：3 格內其他怪受主目標最終傷害 X%，計入回魔，範圍技能不擴散
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack, processMonsterAttack } from '../../systems/arpgEventHandler';
import { gainRage, consumeCalm, syncCalmEffect } from '../../systems/abilityCombat';
import { getHpRegen, getMpRegen } from '../../systems/regen';
import { getSkillCooldownReduction } from '../../systems/combat';
import type { Ability } from '../../models/ability';
import { instantiateSkill, type Skill } from '../../models/skill';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import { useGameStore } from '../../stores/gameStore';
import { defaultSession } from '../../stores/session';
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

function weapon(ability?: Ability, id = 1, type = 'sword'): EquipmentInstance {
  return {
    id, templateId: 1019, name: '終焉之刃', type, slot: 'rightHand', isTwoHanded: type !== 'sword',
    smallMonsterDamage: 19, largeMonsterDamage: 18, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true, ...(ability ? { ability } : {}),
  } as EquipmentInstance;
}

const POSITIONS: Record<string, { x: number; y: number }> = { m1: { x: 5, y: 5 }, m2: { x: 7, y: 5 }, m3: { x: 9, y: 5 } };

function run(gear: EquipmentInstance[], targets: Record<string, MonsterInstance>, skill?: Skill, targetIds = ['m1']) {
  const gs = useGameStore.getState();
  const mapMonsters = Object.keys(targets).map(id => ({ id, position: POSITIONS[id], isBoss: false })) as unknown as MapMonster[];
  return processPlayerAttack(
    {
      type: 'player_attack',
      action: skill ? { type: 'skill', skillId: skill.id } : { type: 'normal_attack' },
      targetMonsterIds: targetIds,
      ...(skill ? { skill } : {}),
    },
    {
      character: gs.character!, equippedGear: gear, activeEffects: gs.activeEffects, skills: skill ? [skill] : [],
      monsterInstances: new Map(Object.entries(targets)), mapMonsters,
    },
  );
}

const effectsOf = (category: string) => useGameStore.getState().activeEffects.filter(e => e.category === category);

beforeEach(() => {
  useGameStore.setState({ character: knight(), skills: [], activeEffects: [], equippedGear: {} });
  defaultSession.loop.abilityCombo = undefined;
  defaultSession.loop.abilityFocus = undefined;
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('追加傷害', () => {
  it('擲中機率時每下加固定值；雙持兩下各加一次', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const bonus: Ability = { type: 'bonus_damage', params: { chance: 5, damage: 12 } };
    const base = run([weapon()], { m1: monster() }).damages[0];
    const boosted = run([weapon(bonus)], { m1: monster() }).damages[0];
    expect(boosted.damage - base.damage).toBe(12);

    const dualBase = run([weapon(undefined, 1, 'dualBlade')], { m1: monster() }).damages[0];
    const dualBoost = run([weapon(bonus, 1, 'dualBlade')], { m1: monster() }).damages[0];
    expect(dualBoost.damage - dualBase.damage).toBe(24);
  });

  it('沒擲中不加', () => {
    // 0.07：命中、但高於 5% 觸發率
    vi.spyOn(Math, 'random').mockReturnValue(0.07);
    const base = run([weapon()], { m1: monster() }).damages[0];
    const same = run([weapon({ type: 'bonus_damage', params: { chance: 5, damage: 12 } })], { m1: monster() }).damages[0];
    expect(same.damage).toBe(base.damage);
  });
});

describe('追打傷害', () => {
  const combo: Ability = { type: 'combo_strike', params: { every: 3, bonus: 50 } };

  it('普攻每一下計 1，第 N 下 ×(1 + M%) 後歸零', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const base = run([weapon()], { m1: monster() }).damages[0].damage;
    const dealt = [1, 2, 3, 4].map(() => run([weapon(combo)], { m1: monster() }).damages[0].damage);
    expect(dealt).toEqual([base, base, Math.floor(base * 1.5), base]);
  });

  it('雙持一次攻擊計 2', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const dual = weapon(combo, 1, 'dualBlade');
    run([dual], { m1: monster() });
    expect(defaultSession.loop.abilityCombo?.count).toBe(2);
    const second = run([dual], { m1: monster() }).damages[0];
    expect(second.hits[0].damage).toBeGreaterThan(second.hits[1].damage);
  });

  it('技能每施放一次計 1，觸發時該次全部目標加成', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fireball = instantiateSkill('fireball')!;
    const targets = () => ({ m1: monster(), m2: monster() });
    const base = run([weapon()], targets(), fireball).damages.map(d => d.damage);
    run([weapon(combo)], targets(), fireball);
    run([weapon(combo)], targets(), fireball);
    expect(defaultSession.loop.abilityCombo?.count).toBe(2);
    const third = run([weapon(combo)], targets(), fireball).damages.map(d => d.damage);
    expect(third).toEqual(base.map(d => Math.floor(d * 1.5)));
  });

  it('換武器或重新進圖歸零', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    run([weapon(combo, 1)], { m1: monster() });
    run([weapon(combo, 1)], { m1: monster() });
    run([weapon(combo, 2)], { m1: monster() });
    expect(defaultSession.loop.abilityCombo?.count).toBe(1);
    useGameStore.setState({ character: { ...knight(), areaEnteredAt: NOW + 1 } });
    run([weapon(combo, 2)], { m1: monster() });
    expect(defaultSession.loop.abilityCombo?.count).toBe(1);
  });

  it('沒命中不計', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const r = run([weapon(combo)], { m1: monster() });
    expect(r.damages[0].isMiss).toBe(true);
    expect(defaultSession.loop.abilityCombo).toBeUndefined();
  });
});

describe('專注打擊', () => {
  const focus: Ability = { type: 'focus_strike', params: { percent: 15 } };
  const withStacks = (stacks: Record<string, number>, key = String(NOW)) => {
    defaultSession.loop.abilityFocus = { key, stacks: new Map(Object.entries(stacks)) };
  };
  const stacksOf = (id: string) => defaultSession.loop.abilityFocus?.stacks.get(id);

  it('第 1 下無加成，結算後加 1 層；之後依層數 ×(1 + 層數 × X%)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const base = run([weapon()], { m1: monster() }).damages[0].damage;
    expect(run([weapon(focus)], { m1: monster() }).damages[0].damage).toBe(base);
    expect(stacksOf('m1')).toBe(1);
    withStacks({ m1: 20 });
    expect(run([weapon(focus)], { m1: monster() }).damages[0].damage).toBe(Math.floor(base * 1.3));
    expect(stacksOf('m1')).toBe(21);
  });

  it('雙持一次攻擊逐下加層', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const base = run([weapon(undefined, 1, 'dualBlade')], { m1: monster() }).damages[0].hits.map(h => h.damage);
    withStacks({ m1: 20 });
    const hits = run([weapon(focus, 1, 'dualBlade')], { m1: monster() }).damages[0].hits.map(h => h.damage);
    expect(hits).toEqual([Math.floor(base[0] * 1.3), Math.floor(base[1] * 1.315)]);
    expect(stacksOf('m1')).toBe(22);
  });

  it('加成上限 +100%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const base = run([weapon()], { m1: monster() }).damages[0].damage;
    withStacks({ m1: 1000 });
    expect(run([weapon(focus)], { m1: monster() }).damages[0].damage).toBe(base * 2);
  });

  it('範圍技能每隻怪各自記層數', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fireball = instantiateSkill('fireball')!;
    const both = ['m1', 'm2'];
    const base = run([weapon()], { m1: monster(), m2: monster() }, fireball, both).damages.map(d => d.damage);
    withStacks({ m1: 20 });
    const dealt = run([weapon(focus)], { m1: monster(), m2: monster() }, fireball, both).damages.map(d => d.damage);
    expect(dealt).toEqual([Math.floor(base[0] * 1.3), base[1]]);
    expect([stacksOf('m1'), stacksOf('m2')]).toEqual([21, 1]);
  });

  it('換地圖（進入地圖時間改變）全部清除；怪死清除該怪', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    withStacks({ m1: 20, m2: 5 }, String(NOW - 1));
    run([weapon(focus)], { m1: monster() });
    expect([stacksOf('m1'), stacksOf('m2')]).toEqual([1, undefined]);
    const r = run([weapon(focus)], { m1: monster({ currentHp: 1 }) });
    expect(r.damages[0].killed).toBe(true);
    expect(stacksOf('m1')).toBeUndefined();
  });

  it('未命中不加層、不歸零', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    withStacks({ m1: 20 });
    expect(run([weapon(focus)], { m1: monster() }).damages[0].isMiss).toBe(true);
    expect(stacksOf('m1')).toBe(20);
  });
});

describe('單體技能擴散', () => {
  const splash: Ability = { type: 'skill_splash', params: { percent: 20 } };

  it('3 格內其他怪受主目標最終傷害 X%，3 格外不受', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const iceBolt = instantiateSkill('ice-bolt')!;
    const r = run([weapon(splash)], { m1: monster(), m2: monster(), m3: monster() }, iceBolt);
    const [primary, ...others] = r.damages;
    expect(primary.targetId).toBe('m1');
    expect(others).toHaveLength(1);
    expect(others[0]).toMatchObject({ targetId: 'm2', damage: Math.floor(primary.damage * 0.2), splash: true });
  });

  it('普攻與範圍技能不擴散', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(run([weapon(splash)], { m1: monster(), m2: monster() }).damages).toHaveLength(1);
    const fireball = { ...instantiateSkill('fireball')!, maxTargets: 1 };
    expect(run([weapon(splash)], { m1: monster(), m2: monster() }, fireball).damages.every(d => !d.splash)).toBe(true);
  });

  it('擴散傷害計入魔力奪取的回魔', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const drain: Skill = { ...instantiateSkill('wind-blade')!, id: 'mana-drain', mpDrainRatio: 1, mpCost: 0 };
    useGameStore.setState({ character: { ...knight(), mp: 0 }, skills: [drain] });
    const r = run([weapon(splash)], { m1: monster(), m2: monster() }, drain);
    const total = r.damages.reduce((s, d) => s + d.damage, 0);
    expect(r.mpRestored).toBe(total);
  });
});

describe('職業池（§ 7S.5）', () => {
  const classSkill = (id: string): Skill => instantiateFromTemplate(id)!;

  it('復仇之刃：快照物理、自身增益在傷害之後才施加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const vengeance = classSkill('vengeance');
    useGameStore.setState({ character: { ...knight(), hp: 100 }, skills: [vengeance] });
    const noBuff = run([weapon()], { m1: monster() }, { ...vengeance, selfBuff: undefined }).damages[0].damage;
    const first = run([weapon()], { m1: monster() }, vengeance).damages[0].damage;
    expect(first).toBe(noBuff);
    expect(effectsOf('vengeance')).toHaveLength(1);
    const buffed = run([weapon()], { m1: monster() }, vengeance).damages[0].damage;
    expect(buffed).toBeGreaterThan(first);
  });

  it('復仇之刃強化：滿血也給固定攻擊力', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const vengeance = classSkill('vengeance');
    useGameStore.setState({ character: { ...knight(), hp: 1000 }, skills: [vengeance] });
    run([weapon({ type: 'vengeance_boost', params: { percent: 15 } })], { m1: monster() }, vengeance);
    expect(effectsOf('vengeance')[0].modifiers).toEqual([{ stat: 'attack_power', value: 15, isPercent: true }]);
  });

  it('魔力奪取強化：傷害 ×(1 + X%)，回魔照加成後的傷害', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const drain = classSkill('mana-drain');
    useGameStore.setState({ character: { ...knight(), className: 'elementalist', mp: 0 }, skills: [drain] });
    const base = run([weapon()], { m1: monster() }, drain).damages[0].damage;
    useGameStore.setState({ character: { ...knight(), className: 'elementalist', mp: 0 } });
    const r = run([weapon({ type: 'mana_drain_boost', params: { percent: 20 } })], { m1: monster() }, drain);
    expect(r.damages[0].damage).toBe(Math.floor(base * 1.2));
    expect(r.mpRestored).toBe(r.damages[0].damage);
  });

  it('精神匯聚強化：下一次攻擊技能加成後消耗', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const priest = { ...knight(), className: 'priest' as const };
    const spirit = classSkill('high-heal');
    const bolt = instantiateSkill('holy-bolt')!;
    const gear = [weapon({ type: 'spirit_gathering_boost', params: { percent: 20 } })];
    useGameStore.setState({ character: priest, skills: [spirit, bolt] });
    const base = run(gear, { m1: monster() }, bolt).damages[0].damage;
    run(gear, {}, spirit);
    expect(effectsOf('ability-next-attack')).toHaveLength(1);
    const boosted = run(gear, { m1: monster() }, bolt).damages[0].damage;
    expect(boosted).toBe(Math.floor(base * 1.2));
    expect(effectsOf('ability-next-attack')).toHaveLength(0);
  });

  it('毒霧強化：立即打出 10 跳、不上毒', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const mist = classSkill('poison-mist');
    useGameStore.setState({ character: { ...knight(), className: 'thief' }, skills: [mist] });
    const r = run([weapon({ type: 'poison_mist_boost', params: {} })], { m1: monster() }, mist);
    expect(r.damages[0].damage).toBeGreaterThan(0);
    expect(r.damages[0].damage % 10).toBe(0);
    expect(effectsOf('poisoned')).toHaveLength(0);

    useGameStore.setState({ activeEffects: [] });
    const plain = run([weapon()], { m1: monster() }, mist);
    expect(plain.damages[0].damage).toBe(0);
    expect(effectsOf('poisoned')).toHaveLength(1);
  });

  it('淬毒強化：施放時寫進 buff，命中上毒的每秒傷害 ×(1 + X%)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const thief = { ...knight(), className: 'thief' as const };
    const envenom = classSkill('envenom');
    useGameStore.setState({ character: thief, skills: [envenom] });
    run([weapon()], {}, envenom);
    run([weapon()], { m1: monster() });
    const plainDot = effectsOf('poisoned')[0].dot!.damage;

    useGameStore.setState({ character: thief, skills: [envenom], activeEffects: [] });
    const boosted = [weapon({ type: 'envenom_boost', params: { percent: 60 } })];
    run(boosted, {}, envenom);
    run(boosted, { m1: monster() });
    expect(effectsOf('poisoned')[0].dot!.damage).toBeGreaterThan(plainDot);
  });

  it('火矢附魔強化：非弓普攻也加 +15', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const elf = { ...knight(), className: 'elf' as const };
    const fire = classSkill('fire-arrow');
    useGameStore.setState({ character: elf, skills: [fire] });
    run([weapon()], {}, fire);
    const plain = run([weapon()], { m1: monster({ element: 'none' as never }) }).damages[0].damage;
    useGameStore.setState({ character: elf, skills: [fire], activeEffects: [] });
    const boosted = [weapon({ type: 'fire_arrow_boost', params: {} })];
    run(boosted, {}, fire);
    const withBonus = run(boosted, { m1: monster({ element: 'none' as never }) }).damages[0].damage;
    expect(withBonus).toBeGreaterThan(plain);
  });
});

describe('飾品共通池（§ 7S.5）', () => {
  function ring(ability: Ability, slot = 'ring1'): EquipmentInstance {
    return { id: 50, templateId: 1, name: '戒指', type: 'armor', slot, isTwoHanded: false, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ability } as EquipmentInstance;
  }

  function hitBy(gear: EquipmentInstance[], target: MonsterInstance, cast = false) {
    const gs = useGameStore.getState();
    return processMonsterAttack(
      { type: 'monster_attack', monsterId: 'm1', attackType: 'melee', ...(cast ? { damageMultiplier: 1.2 } : {}) } as never,
      {
        character: gs.character!, equippedGear: gear, activeEffects: gs.activeEffects, skills: [],
        monsterInstances: new Map([['m1', target]]),
        mapMonsters: [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[],
      },
    );
  }

  it('荊棘反彈：實際受到的傷害 × X%，多件加總', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const target = monster({ currentHp: 1000 });
    const gear = [ring({ type: 'thorns', params: { percent: 20 } }), ring({ type: 'thorns', params: { percent: 30 } }, 'ring2')];
    const r = hitBy(gear, target)!;
    expect(r.isDodged).toBe(false);
    expect(r.thorns!.damage).toBe(Math.floor(r.damage * 0.5));
    expect(target.currentHp).toBe(1000 - r.thorns!.damage);

  });

  it('怒氣：累積減傷後傷害（上限 100）、每秒依最慢衰減減少；有怒氣時魔抗 +10、防禦 +5', () => {
    const holder: { abilityRage?: number; abilityRageAt?: number } = {};
    const gear = [ring({ type: 'rage', params: { decay: 15 } }), ring({ type: 'rage', params: { decay: 5 } }, 'ring2')];
    const first = gainRage(holder, gear, 40, 0)!;
    expect(first.modifiers).toEqual([
      { stat: 'magic_resist', value: 10, isPercent: false },
      { stat: 'defense', value: 5, isPercent: false },
      { stat: 'rage_decay', value: 5, isPercent: false },
    ]);
    expect(first.duration).toBe(8000);
    const second = gainRage(holder, gear, 90, 2000)!;
    expect(holder.abilityRage).toBe(100);
    expect(second.duration).toBe(20000);
    expect(gainRage({}, [], 40, 0)).toBeUndefined();
  });

  it('怒氣：被命中時掛上 buff', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    useGameStore.setState({ character: { ...knight(), hp: 1000 } });
    defaultSession.loop.abilityRage = undefined;
    defaultSession.loop.abilityRageAt = undefined;
    const r = hitBy([ring({ type: 'rage', params: { decay: 10 } })], monster())!;
    expect(r.isDodged).toBe(false);
    expect(effectsOf('ability-rage')).toHaveLength(1);
  });

  it('平靜：每秒累積 rate（上限 100），被命中時取出並歸零；進新地圖從頭算', () => {
    const holder: { abilityCalmSince?: number } = {};
    const gear = [ring({ type: 'calm', params: { rate: 8 } })];
    expect(consumeCalm(holder, gear, 0, 5500)).toBe(40);
    expect(consumeCalm(holder, gear, 0, 6500)).toBe(8);
    expect(consumeCalm(holder, gear, 0, 30000)).toBe(100);
    expect(consumeCalm(holder, gear, 30500, 32500)).toBe(16);
    expect(consumeCalm({}, [], 0, 9000)).toBe(0);
  });

  it('平靜：被命中時冷卻中技能剩餘冷卻縮短 X%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const bolt = { ...instantiateSkill('ice-bolt')!, lastUsedAt: NOW - 1000 };
    useGameStore.setState({ character: { ...knight(), hp: 1000, areaEnteredAt: NOW - 10_000 }, skills: [bolt] });
    defaultSession.loop.abilityCalmSince = undefined;
    const r = hitBy([ring({ type: 'calm', params: { rate: 5 } })], monster())!;
    expect(r.isDodged).toBe(false);
    const cdr = getSkillCooldownReduction(useGameStore.getState().character!, [], []);
    const remainingBefore = bolt.lastUsedAt + Math.floor(bolt.cooldown * (1 - cdr / 100)) - NOW;
    const after = useGameStore.getState().skills[0].lastUsedAt;
    expect(after).toBe(bolt.lastUsedAt - Math.floor(remainingBefore * 0.5));
  });

  it('低血回復：HP 低於 50% 才加、戰鬥中減半；多件加總', () => {
    const gear = [ring({ type: 'low_hp_regen', params: { regen: 10 } }), ring({ type: 'low_hp_regen', params: { regen: 20 } }, 'ring2')];
    const low = { ...knight(), hp: 400 };
    const high = { ...knight(), hp: 600 };
    expect(getHpRegen(low, false, gear) - getHpRegen(low, false, [])).toBe(30);
    expect(getHpRegen(high, false, gear)).toBe(getHpRegen(high, false, []));
    expect(getHpRegen(low, true, gear)).toBe(Math.floor((getHpRegen(low, false, [])  + 30) / 2));
  });

  it('低魔回復：MP 低於 50% 才加', () => {
    const gear = [ring({ type: 'low_mp_regen', params: { regen: 15 } })];
    expect(getMpRegen({ ...knight(), mp: 100 }, false, gear) - getMpRegen({ ...knight(), mp: 100 }, false, [])).toBe(15);
    expect(getMpRegen({ ...knight(), mp: 300 }, false, gear)).toBe(getMpRegen({ ...knight(), mp: 300 }, false, []));
  });
});

describe('演出旗標與平靜 buff（§ 7S.7）', () => {
  it('追打那一下帶 combo 旗標', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const combo: Ability = { type: 'combo_strike', params: { every: 2, bonus: 10 } };
    run([weapon(combo)], { m1: monster() });
    const second = run([weapon(combo)], { m1: monster() }).damages[0];
    expect(second.hits[0].combo).toBe(true);
  });

  it('平靜 buff：有技能時掛上、開始時間＝起算時間；拿掉技能時移除', () => {
    const holder: { abilityCalmSince?: number } = {};
    const gear = [{ ability: { type: 'calm', params: { rate: 6 } } } as unknown as EquipmentInstance];
    const added = syncCalmEffect(holder, gear, [], 1000, 5000)!;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ category: 'ability-calm', startTime: 1000 });
    expect(syncCalmEffect(holder, gear, added, 1000, 6000)).toBeUndefined();
    holder.abilityCalmSince = 6000;
    expect(syncCalmEffect(holder, gear, added, 1000, 6000)![0].startTime).toBe(6000);
    expect(syncCalmEffect(holder, [], added, 1000, 7000)).toEqual([]);
  });
});

describe('天賦條件 ability_meter（`51-auto-talent.md`）', () => {
  it('依當下怒氣比較；沒有 buff 時為 0', async () => {
    const { evaluatePersistentScript } = await import('../../systems/scriptRunner');
    const { TOWN_SCROLL_CONFIG } = await import('../../models/townScroll');
    const rage = {
      id: 'r', sourceSkillId: 'rage', sourceSkillName: '怒氣', category: 'ability-rage', type: 'buff' as const, target: 'player' as const,
      modifiers: [{ stat: 'rage_decay', value: 10, isPercent: false }], startTime: NOW, duration: 6000, tags: [], name: '怒氣', description: '',
    };
    const scroll = { itemId: TOWN_SCROLL_CONFIG['neutral-town'].itemId, amount: 1 };
    const decide = (compare: 'gt' | 'lt', value: number, effects: typeof rage[]) => evaluatePersistentScript([{
      id: 'x', enabled: true,
      conditions: [{ type: 'ability_meter', match: 'rage', compare, value }],
      action: { type: 'use_town_scroll' },
    }] as never, {
      character: { hp: 50, maxHp: 100, mp: 50, maxMp: 100, level: 10, areaEnteredAt: 0 },
      effectiveMaxHp: 100, effectiveMaxMp: 100, bagItems: [scroll], skills: [], activeEffects: effects,
      lastPotionUsedAt: 0, now: NOW,
    } as never);
    // 怒氣 60（6 秒 × 每秒 10）
    expect(decide('gt', 50, [rage])?.type).toBe('use_town_scroll');
    expect(decide('gt', 70, [rage])).toBeNull();
    expect(decide('lt', 70, [rage])?.type).toBe('use_town_scroll');
    expect(decide('gt', 0, [])).toBeNull();
  });
});
