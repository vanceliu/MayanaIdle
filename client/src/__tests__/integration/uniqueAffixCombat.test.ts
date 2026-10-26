/**
 * T7 獨有詞綴與命中下降／防禦下降的戰鬥整合測試 —— 走 `processPlayerAttack`／`processMonsterAttack`。
 *
 * 規則（`07-affix-tier7.md` § 7T.4、`07-affix.md` § 7.9）：
 *  - 命中類每一下命中判定一次；雙持一次攻擊兩下
 *  - 追加傷害加在最終傷害；命中暈眩 5 秒、暈眩中不可再上、Boss 受控場免疫冷卻約束
 *  - 擊殺回血每擊殺一隻判定一次
 *  - 受擊觸發只在受到傷害時判定；同種類刷新時間
 *  - 命中下降／防禦下降 10% 觸發、3 秒、同一隻怪後施放覆蓋；命中下降加在 35% 迴避上限之後
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack, processMonsterAttack } from '../../systems/arpgEventHandler';
import { calculateMonsterAttack } from '../../systems/combat';
import {
  HIT_DOWN_CATEGORY, DEFENSE_DOWN_CATEGORY, HIT_DOWN_STAT, AFFIX_DEBUFF_DURATION_MS, type Affix,
} from '../../models/affix';
import { UNIQUE_STUN_CATEGORY, UNIQUE_STUN_DURATION_MS, type UniqueAffix } from '../../models/uniqueAffix';
import { getTotalAttributes } from '../../models/character';
import { useGameStore } from '../../stores/gameStore';
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

function knight(hp = 100, mp = 50): Character {
  return {
    name: 'Tester', className: 'knight', level: 60, exp: 0, expToNext: 100,
    hp, maxHp: 1000, mp, maxMp: 400,
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

function weapon(uniqueAffix?: UniqueAffix, affixes: Affix[] = [], type = 'sword'): EquipmentInstance {
  return {
    id: 1, templateId: 1019, name: '終焉之刃', type, slot: 'rightHand', isTwoHanded: type !== 'sword',
    smallMonsterDamage: 19, largeMonsterDamage: 18, quality: 0, enhancement: 0,
    affixes, ownerId: 1, equipped: true, ...(uniqueAffix ? { uniqueAffix } : {}),
  } as EquipmentInstance;
}

function belt(uniqueAffix: UniqueAffix): EquipmentInstance {
  return {
    id: 2, templateId: 602, name: '天龍腰帶', type: 'armor', slot: 'belt', isTwoHanded: false,
    defense: 1, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, uniqueAffix,
  } as EquipmentInstance;
}

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

function equip(gear: EquipmentInstance[]) {
  useGameStore.setState({ equippedGear: Object.fromEntries(gear.map(g => [g.slot, g])) as never });
}

function attack(gear: EquipmentInstance[], target: MonsterInstance) {
  equip(gear);
  const gs = useGameStore.getState();
  return processPlayerAttack(
    { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: ['m1'] },
    {
      character: gs.character!, equippedGear: gear, activeEffects: gs.activeEffects, skills: [],
      monsterInstances: new Map([['m1', target]]), mapMonsters,
    },
  );
}

function getHit(gear: EquipmentInstance[], target = monster()) {
  equip(gear);
  const gs = useGameStore.getState();
  return processMonsterAttack(
    { type: 'monster_attack', monsterId: 'm1', attackType: 'melee' } as never,
    {
      character: gs.character!, equippedGear: gear, activeEffects: gs.activeEffects, skills: [],
      monsterInstances: new Map([['m1', target]]), mapMonsters,
    },
  );
}

const effectsOf = (category: string) => useGameStore.getState().activeEffects.filter(e => e.category === category);

beforeEach(() => {
  useGameStore.setState({ character: knight(), skills: [], activeEffects: [], equippedGear: {} });
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('武器命中類', () => {
  it('命中回血：每下命中回 X HP，雙持兩下回兩次', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    attack([weapon({ type: 'hit_heal', value: 12 })], monster());
    expect(useGameStore.getState().character!.hp).toBe(112);

    useGameStore.setState({ character: knight() });
    attack([weapon({ type: 'hit_heal', value: 12 }, [], 'dualBlade')], monster());
    expect(useGameStore.getState().character!.hp).toBe(124);
  });

  it('命中回魔', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    attack([weapon({ type: 'hit_mana', value: 15 })], monster());
    expect(useGameStore.getState().character!.mp).toBe(65);
  });

  it('沒命中就不回', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const r = attack([weapon({ type: 'hit_heal', value: 12 })], monster());
    expect(r.damages[0].isMiss).toBe(true);
    expect(useGameStore.getState().character!.hp).toBe(100);
  });

  it('追加傷害加在每一下的最終傷害', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const base = attack([weapon()], monster()).damages[0];
    const boosted = attack([weapon({ type: 'hit_bonus_damage', value: 15 })], monster()).damages[0];
    expect(boosted.damage - base.damage).toBe(15);
    expect(boosted.hits[0].damage - base.hits[0].damage).toBe(15);

    const dualBase = attack([weapon(undefined, [], 'dualBlade')], monster()).damages[0];
    const dualBoost = attack([weapon({ type: 'hit_bonus_damage', value: 15 }, [], 'dualBlade')], monster()).damages[0];
    expect(dualBoost.damage - dualBase.damage).toBe(30);
  });

  it('擊殺回血：擊殺才回', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    attack([weapon({ type: 'kill_heal', value: 40 })], monster());
    expect(useGameStore.getState().character!.hp).toBe(100);
    const r = attack([weapon({ type: 'kill_heal', value: 40 })], monster({ currentHp: 1 }));
    expect(r.damages[0].killed).toBe(true);
    expect(useGameStore.getState().character!.hp).toBe(140);
  });

  it('命中暈眩 5 秒；暈眩中不再上', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    attack([weapon({ type: 'hit_stun', value: 0 })], monster());
    const [stun] = effectsOf(UNIQUE_STUN_CATEGORY);
    expect(stun.stun).toBe(true);
    expect(stun.duration).toBe(UNIQUE_STUN_DURATION_MS);
    expect(stun.targetMonsterId).toBe('m1');

    attack([weapon({ type: 'hit_stun', value: 0 })], monster());
    expect(effectsOf(UNIQUE_STUN_CATEGORY)).toHaveLength(1);
  });

  it('Boss 在控場免疫冷卻中不吃暈眩；成功時設定冷卻', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const boss = monster({ isBoss: true, ccImmuneUntil: NOW + 1000 });
    const r = attack([weapon({ type: 'hit_stun', value: 0 })], boss);
    expect(effectsOf(UNIQUE_STUN_CATEGORY)).toHaveLength(0);
    expect(r.logs.some(l => l.text.includes('免疫控場'))).toBe(true);

    const fresh = monster({ isBoss: true });
    attack([weapon({ type: 'hit_stun', value: 0 })], fresh);
    expect(effectsOf(UNIQUE_STUN_CATEGORY)).toHaveLength(1);
    expect(fresh.ccImmuneUntil).toBeGreaterThan(NOW);
  });

  it('沒擲中 20% 就不暈', () => {
    // 0.25：命中、但高於 20% 觸發率
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    attack([weapon({ type: 'hit_stun', value: 0 })], monster());
    expect(effectsOf(UNIQUE_STUN_CATEGORY)).toHaveLength(0);
  });
});

describe('命中下降／防禦下降（§ 7.9）', () => {
  const hitDown: Affix = { type: 'hit_down', tier: 6, value: 16 };
  const defDown: Affix = { type: 'defense_down', tier: 7, value: 20 };

  it('命中後 10% 觸發，3 秒，數值存成怪物 debuff', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    attack([weapon(undefined, [hitDown, defDown])], monster());
    const [h] = effectsOf(HIT_DOWN_CATEGORY);
    expect(h.modifiers).toEqual([{ stat: HIT_DOWN_STAT, value: -16, isPercent: true }]);
    expect(h.duration).toBe(AFFIX_DEBUFF_DURATION_MS);
    const [d] = effectsOf(DEFENSE_DOWN_CATEGORY);
    expect(d.modifiers).toEqual([{ stat: 'defense', value: -20, isPercent: true }]);
  });

  it('同一隻怪後施放覆蓋並刷新時間', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    attack([weapon(undefined, [hitDown])], monster());
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 2000);
    attack([weapon(undefined, [hitDown])], monster());
    const list = effectsOf(HIT_DOWN_CATEGORY);
    expect(list).toHaveLength(1);
    expect(list[0].startTime).toBe(NOW + 2000);
  });

  it('沒擲中 10% 不觸發', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.15);
    attack([weapon(undefined, [hitDown])], monster());
    expect(effectsOf(HIT_DOWN_CATEGORY)).toHaveLength(0);
  });

  it('命中下降加在 35% 迴避上限之後', () => {
    const c = knight();
    const capped: ActiveEffect = {
      id: 'smoke', sourceSkillId: 'smoke', sourceSkillName: 'smoke', category: 'evasion', type: 'buff', target: 'player',
      modifiers: [{ stat: 'evasion', value: 60, isPercent: true }], startTime: NOW, duration: 60_000, tags: [], name: '', description: '',
    };
    const down: ActiveEffect = {
      id: 'down', sourceSkillId: 'hit_down', sourceSkillName: '命中下降', category: HIT_DOWN_CATEGORY,
      type: 'debuff', target: 'monster', targetIdx: 0, targetMonsterId: 'm1',
      modifiers: [{ stat: HIT_DOWN_STAT, value: -10, isPercent: true }], startTime: NOW, duration: 3000, tags: [], name: '', description: '',
    };
    vi.spyOn(Math, 'random').mockReturnValue(0.40); // 40：上限 35 擋不下，加 10 後 45 擋得下
    expect(calculateMonsterAttack(monster(), c, [], [capped], 0, 1, 'm1').dodged).toBe(false);
    expect(calculateMonsterAttack(monster(), c, [], [capped, down], 0, 1, 'm1').dodged).toBe(true);
    // 其他怪不受影響
    expect(calculateMonsterAttack(monster(), c, [], [capped, down], 0, 1, 'm2').dodged).toBe(false);
  });
});

describe('受擊觸發（§ 7T.4）', () => {
  // 0.06：高於騎士迴避 5%（AGI 0）→ 被打中；低於 10% 觸發率
  it('受到傷害時 10% 給 buff，屬性實際增加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.06);
    const gear = [belt({ type: 'struck_str', value: 3 })];
    const r = getHit(gear)!;
    expect(r.isDodged).toBe(false);
    const [buff] = effectsOf('t7-struck_str');
    expect(buff.duration).toBe(5000);
    const gs = useGameStore.getState();
    expect(getTotalAttributes(gs.character!, gs.activeEffects).STR).toBe(23);
    expect(r.restoreLogs?.some(l => l.text.includes('受擊力量觸發'))).toBe(true);
  });

  it('被迴避不觸發', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const r = getHit([belt({ type: 'struck_str', value: 3 })])!;
    expect(r.isDodged).toBe(true);
    expect(effectsOf('t7-struck_str')).toHaveLength(0);
  });

  it('沒擲中不觸發', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    getHit([belt({ type: 'struck_str', value: 3 })]);
    expect(effectsOf('t7-struck_str')).toHaveLength(0);
  });

  it('再觸發刷新時間，不疊加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.06);
    getHit([belt({ type: 'struck_str', value: 3 })]);
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 3000);
    getHit([belt({ type: 'struck_str', value: 3 })]);
    const list = effectsOf('t7-struck_str');
    expect(list).toHaveLength(1);
    expect(list[0].startTime).toBe(NOW + 3000);
  });
});
