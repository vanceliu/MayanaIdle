import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateMonsterAttack, BASE_CHARACTER_DEFENSE } from '../combat';
import { isRangedAttackType } from '../../models/monster';
import { MONSTER_SEEDS } from '../../db/seed/monsterSeeds';
import type { Character } from '../../models/character';
import type { MonsterInstance, MonsterAttackType } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';

/** 弓箭手系怪物（25-monster-system.md § 25.8「遠程物理」） */
const ARCHERS = [
  '妖魔神射手',
  '妖魔投斧手',
  '逆影獵手',
  '高階骷髏神射手',
  '戰場骷髏弓手',
  '遠古弓箭手',
  '遠古神射手',
  '高階哥布林弓手',
  '精靈王射手',
];

const RANGED_PHYSICAL_RANGE = 10;

function char(spi: number): Character {
  return {
    name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 100,
    hp: 9999, maxHp: 9999, mp: 100, maxMp: 100,
    baseAttributes: { STR: 14, AGI: 0, VIT: 16, SPI: spi, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [],
    areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}

function monster(attackType: MonsterAttackType, atk: number): MonsterInstance {
  const rangeByType = { melee: 1.5, ranged: RANGED_PHYSICAL_RANGE, magic: 8 };
  return {
    templateId: 1, name: '測試怪', level: 50, currentHp: 100, maxHp: 100,
    attackMin: atk, attackMax: atk, defense: 0, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType, attackRange: rangeByType[attackType], attackInterval: 1000,
  };
}

/** 防禦 N 的胸甲，且不帶格擋（避免格擋 roll 干擾） */
/**
 * 產生「有效防禦剛好是 `defense`」的裝備。
 *
 * 角色初始防禦是 -10（`21-combat-formula.md` § 21.5），裝備要多帶這 10 點填坑，
 * 最終防禦才等於參數值 —— 這樣底下每條斷言仍可直接以「N 防禦 → N% 減傷」閱讀。
 */
function armor(defense: number): EquipmentInstance {
  return {
    templateId: 2, name: '測試甲', type: 'armor', slot: 'chest', isTwoHanded: false,
    defense: defense - BASE_CHARACTER_DEFENSE,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
  };
}

/** 迴避與格擋都不觸發、傷害不隨機 */
function noRandom() {
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
}

describe('弓箭手 seed 設定（§ 25.8 遠程物理）', () => {
  const rangedSeeds = MONSTER_SEEDS.filter(m => m.attackType === 'ranged');

  it('9 種弓箭手系怪物，共 20 筆', () => {
    expect(rangedSeeds).toHaveLength(20);
    expect([...new Set(rangedSeeds.map(m => m.name))].sort()).toEqual([...ARCHERS].sort());
  });

  it('每一筆弓箭手 seed 都標記為 ranged，沒有漏標', () => {
    const archerSeeds = MONSTER_SEEDS.filter(m => ARCHERS.includes(m.name));
    expect(archerSeeds).toHaveLength(rangedSeeds.length);
    for (const m of archerSeeds) expect(m.attackType, m.name).toBe('ranged');
  });

  it('射程一律 10 格', () => {
    for (const m of rangedSeeds) expect(m.attackRange, m.name).toBe(RANGED_PHYSICAL_RANGE);
  });

  it('弓箭手不可被標成 magic（魔抗擋不到箭矢）', () => {
    const magicArchers = MONSTER_SEEDS.filter(
      m => ARCHERS.includes(m.name) && m.attackType === 'magic',
    );
    expect(magicArchers).toEqual([]);
  });

  it('巫師／魔導系維持 magic 12 筆，未被本次改動波及', () => {
    expect(MONSTER_SEEDS.filter(m => m.attackType === 'magic')).toHaveLength(12);
  });

  it('ranged 需要射程與視線判定', () => {
    expect(isRangedAttackType('ranged')).toBe(true);
  });
});

describe('遠程物理傷害走物理減傷', () => {
  it('與近戰同防禦下傷害相同', () => {
    noRandom();
    const gear = [armor(60)];
    const melee = calculateMonsterAttack(monster('melee', 100), char(18), gear, []).damage;
    const ranged = calculateMonsterAttack(monster('ranged', 100), char(18), gear, []).damage;
    expect(ranged).toBe(melee);
    expect(ranged).toBe(Math.floor(100 * (100 - 60) / 100));
  });

  it('魔法抗性對遠程物理無效', () => {
    noRandom();
    const gear = [armor(60)];
    const lowSpi = calculateMonsterAttack(monster('ranged', 100), char(0), gear, []).damage;
    const highSpi = calculateMonsterAttack(monster('ranged', 100), char(80), gear, []).damage;
    expect(highSpi).toBe(lowSpi);
  });

  it('同防禦下，遠程物理比遠程魔法吃得更少傷（防禦對魔法只有一半效力）', () => {
    noRandom();
    const gear = [armor(70)];
    const ranged = calculateMonsterAttack(monster('ranged', 100), char(0), gear, []).damage;
    const magic = calculateMonsterAttack(monster('magic', 100), char(0), gear, []).damage;
    expect(ranged).toBeLessThan(magic);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
