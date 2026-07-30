import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculatePlayerAttack,
  calculateMonsterAttack,
  getPlayerAttackInterval,
  getPlayerDebuffModifier,
} from '../combat';
import { tickPlayerCombat, createPlayerCombatContext } from '../playerCombatFSM';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';
import type { MapData } from '../../models/mapControl';
import { createPlayerDebuffEffect } from '../playerDebuffSystem';

const NOW = 10_000;

function character(overrides: Partial<Character> = {}): Character {
  return {
    name: 'TestHero',
    className: 'knight',
    level: 10,
    exp: 0,
    expToNext: 100,
    hp: 200,
    maxHp: 200,
    mp: 80,
    maxMp: 80,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0,
    currentArea: 'dawn-plains',
    currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains',
    currentFloor: null,
    skills: [],
    unspentAttributePoints: 0,
    quests: [],
    areaEnteredAt: NOW,
    createdAt: NOW,
    userId: 1,
    ...overrides,
  };
}

function monster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1,
    name: '哥布林',
    level: 10,
    currentHp: 100,
    maxHp: 100,
    attackMin: 40,
    attackMax: 40,
    defense: 10,
    exp: 50,
    race: 'normal',
    size: 'small',
    element: 'none',
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1000,
    ...overrides,
  };
}

function weapon(): EquipmentInstance {
  return {
    templateId: 1,
    name: '鐵劍',
    type: 'sword',
    slot: 'rightHand',
    isTwoHanded: false,
    smallMonsterDamage: 30,
    largeMonsterDamage: 25,
    defense: 0,
    quality: 0,
    enhancement: 0,
    affixes: [],
    ownerId: 1,
    equipped: true,
  } as EquipmentInstance;
}

function heavyArmor(defense: number): EquipmentInstance {
  return {
    templateId: 50,
    name: '重甲',
    type: 'armor',
    slot: 'chest',
    isTwoHanded: false,
    smallMonsterDamage: 0,
    largeMonsterDamage: 0,
    defense,
    quality: 0,
    enhancement: 0,
    affixes: [],
    ownerId: 1,
    equipped: true,
  } as EquipmentInstance;
}

function debuff(type: 'curse' | 'weaken' | 'slow' | 'stun'): ActiveEffect {
  return createPlayerDebuffEffect(type, monster(), NOW, new Set());
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPlayerDebuffModifier', () => {
  it('沒有 debuff 時回傳 0', () => {
    expect(getPlayerDebuffModifier([], 'defense')).toBe(0);
  });

  it('回傳角色 debuff 的百分比修正', () => {
    expect(getPlayerDebuffModifier([debuff('curse')], 'defense')).toBe(-20);
    expect(getPlayerDebuffModifier([debuff('weaken')], 'attack')).toBe(-20);
    expect(getPlayerDebuffModifier([debuff('slow')], 'attack_speed')).toBe(-30);
  });

  it('不套用怪物 debuff', () => {
    const monsterDebuff: ActiveEffect = { ...debuff('curse'), target: 'monster' };
    expect(getPlayerDebuffModifier([monsterDebuff], 'defense')).toBe(0);
  });

  it('不套用已過期的 debuff', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 9000); // 詛咒 8s 已過期
    expect(getPlayerDebuffModifier([debuff('curse')], 'defense')).toBe(0);
  });
});

describe('虛弱 — 攻擊力 -20%', () => {
  it('虛弱時普攻傷害降低', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const char = character();
    const target = monster({ defense: 0 });

    const normal = calculatePlayerAttack(char, weapon(), target, [weapon()], [], 0);
    const weakened = calculatePlayerAttack(char, weapon(), target, [weapon()], [debuff('weaken')], 0);

    expect(normal.hit).toBe(true);
    expect(weakened.hit).toBe(true);
    expect(weakened.damage).toBeLessThan(normal.damage);
    expect(weakened.damage).toBe(Math.floor(normal.damage * 0.8));
  });
});

describe('詛咒 — 防禦力 -20%', () => {
  it('詛咒時受到的怪物傷害提高', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 不迴避、不格擋
    const char = character();
    const gear = [heavyArmor(50)];

    const normal = calculateMonsterAttack(monster(), char, gear, [], 0);
    const cursed = calculateMonsterAttack(monster(), char, gear, [debuff('curse')], 0);

    expect(normal.hit).toBe(true);
    expect(cursed.hit).toBe(true);
    expect(cursed.damage).toBeGreaterThan(normal.damage);
  });
});

describe('減速 — 攻擊速度 -30%', () => {
  it('減速時攻擊間隔變長', () => {
    const base = getPlayerAttackInterval([], []);
    const slowed = getPlayerAttackInterval([], [debuff('slow')]);
    expect(slowed).toBeGreaterThan(base);
    expect(slowed).toBe(Math.floor(1200 / 0.7));
  });

  it('攻速 buff 與減速 debuff 相加抵銷', () => {
    const speedBuff: ActiveEffect = {
      id: 'buff-speed', sourceSkillId: 'speed-potion', sourceSkillName: '綠色藥水',
      category: 'speed', type: 'buff', target: 'player',
      modifiers: [{ stat: 'attack_speed', value: 30, isPercent: true }],
      startTime: NOW, duration: 60_000, tags: [], name: '綠色藥水', description: '',
    };
    expect(getPlayerAttackInterval([], [speedBuff, debuff('slow')])).toBe(1200);
  });
});

describe('暈眩 — 攻擊計時器暫停（§ 24.5.1）', () => {
  const map = { width: 20, height: 20, tiles: [] } as unknown as MapData;

  it('暈眩中不產生任何動作', () => {
    const ctx = createPlayerCombatContext();
    const result = tickPlayerCombat(
      ctx,
      { x: 1, y: 1 },
      [{ id: 'm1', index: 0, position: { x: 1, y: 1 }, alive: true }],
      { attackType: 'melee', range: 1.5 },
      map,
      5000,
      true,
    );
    expect(result.action).toBe('none');
  });

  it('暈眩中攻擊計時器不累積', () => {
    const ctx = createPlayerCombatContext();
    ctx.attackCooldown = 1000;
    tickPlayerCombat(
      ctx,
      { x: 1, y: 1 },
      [{ id: 'm1', index: 0, position: { x: 1, y: 1 }, alive: true }],
      { attackType: 'melee', range: 1.5 },
      map,
      5000,
      true,
    );
    expect(ctx.attackTimer).toBe(0);
  });
});
