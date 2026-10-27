import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculatePlayerAttack, calculateSkillAttack, calculateMonsterAttack } from '../combat';
import { handleMonsterDeath } from '../combatLoop';
import { useGameStore } from '../../stores/gameStore';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';

/**
 * 怪物身上的 debuff 以怪物 id 對應（`24-buff-debuff.md`、`07-affix.md` § 7.9）。
 * 怪物清單會隨死亡與生成位移，以位置對應會把防禦下降算到別隻怪身上。
 */
function character(): Character {
  return {
    userId: 1, id: 1, name: '測試', className: 'knight', level: 10, exp: 0, expToNext: 1_000_000,
    hp: 200, maxHp: 200, mp: 80, maxMp: 80,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
  };
}

function monster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '石甲獸', level: 10, currentHp: 100, maxHp: 100, attackMin: 20, attackMax: 20,
    defense: 60, exp: 50, race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000, ...overrides,
  };
}

const WEAPON = {
  templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
  smallMonsterDamage: 40, largeMonsterDamage: 40, defense: 0, quality: 0, enhancement: 0,
  affixes: [], ownerId: 1, equipped: true,
} as EquipmentInstance;

/** 掛在 `monsterId` 身上、施加當下位於 `idx` 的 debuff */
function debuffOn(monsterId: string, idx: number, stat: string, value: number, category = `test-${stat}`): ActiveEffect {
  return {
    id: `debuff-${category}-${monsterId}`, sourceSkillId: category, sourceSkillName: category, category,
    type: 'debuff', target: 'monster', targetIdx: idx, targetMonsterId: monsterId,
    modifiers: [{ stat, value, isPercent: true }], startTime: 5000, duration: 10_000, tags: [],
    name: category, description: category,
  };
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  vi.spyOn(Date, 'now').mockReturnValue(10_000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('防禦下降以怪物 id 對應', () => {
  // m1 被掛上防禦下降時在第 0 位；之後清單位移，m1 移到第 1 位、m2 補到第 0 位
  const effects = [debuffOn('m1', 0, 'defense', -50)];

  it('普攻：原目標移到別的位置仍吃防禦下降', () => {
    const plain = calculatePlayerAttack(character(), WEAPON, monster(), [WEAPON], [], 1, 'm1');
    const debuffed = calculatePlayerAttack(character(), WEAPON, monster(), [WEAPON], effects, 1, 'm1');
    expect(plain.hit).toBe(true);
    expect(debuffed.damage).toBeGreaterThan(plain.damage);
  });

  it('普攻：補到原位置的別隻怪不吃防禦下降', () => {
    const plain = calculatePlayerAttack(character(), WEAPON, monster(), [WEAPON], [], 0, 'm2');
    const other = calculatePlayerAttack(character(), WEAPON, monster(), [WEAPON], effects, 0, 'm2');
    expect(other.damage).toBe(plain.damage);
  });

  it('魔法技能同樣以 id 對應', () => {
    const plain = calculateSkillAttack(character(), 50, 'fire', monster(), [WEAPON], '火球', [], 0, 0, 'm2');
    const other = calculateSkillAttack(character(), 50, 'fire', monster(), [WEAPON], '火球', effects, 0, 0, 'm2');
    const target = calculateSkillAttack(character(), 50, 'fire', monster(), [WEAPON], '火球', effects, 1, 0, 'm1');
    expect(other.damage).toBe(plain.damage);
    expect(target.damage).toBeGreaterThan(plain.damage);
  });
});

describe('攻擊下降以怪物 id 對應', () => {
  it('只有被掛上的那隻怪打人變輕', () => {
    const effects = [debuffOn('m1', 0, 'attack', -50)];
    const plain = calculateMonsterAttack(monster({ defense: 0 }), character(), [], [], 0, 1, 'm2');
    const other = calculateMonsterAttack(monster({ defense: 0 }), character(), [], effects, 0, 1, 'm2');
    const weakened = calculateMonsterAttack(monster({ defense: 0 }), character(), [], effects, 1, 1, 'm1');
    expect(plain.hit).toBe(true);
    expect(other.damage).toBe(plain.damage);
    expect(weakened.damage).toBeLessThan(plain.damage);
  });
});

describe('debuff 的去重與清除', () => {
  beforeEach(() => {
    useGameStore.setState({ character: character(), activeEffects: [], combatLogs: [], bagItems: [], equippedGear: {}, inventory: [] });
  });

  it('不同怪可各自掛上同一種 DoT（施加當下的位置相同也一樣）', () => {
    useGameStore.getState().addEffect(debuffOn('m1', 0, 'none', 0, 'dot-poison'));
    useGameStore.getState().addEffect(debuffOn('m2', 0, 'none', 0, 'dot-poison'));

    expect(useGameStore.getState().activeEffects.map(e => e.targetMonsterId)).toEqual(['m1', 'm2']);
  });

  it('同一隻怪的 DoT 存續期間不重複施加', () => {
    useGameStore.getState().addEffect(debuffOn('m1', 0, 'none', 0, 'dot-poison'));
    useGameStore.getState().addEffect({ ...debuffOn('m1', 1, 'none', 0, 'dot-poison'), id: 'second' });

    expect(useGameStore.getState().activeEffects).toHaveLength(1);
  });

  it('怪物死亡只清自己身上的 debuff', () => {
    useGameStore.setState({
      activeEffects: [debuffOn('m1', 0, 'defense', -50), debuffOn('m2', 1, 'defense', -50)],
    });

    handleMonsterDeath(monster({ currentHp: 0 }), 'm2');

    expect(useGameStore.getState().activeEffects.map(e => e.targetMonsterId)).toEqual(['m1']);
  });
});
