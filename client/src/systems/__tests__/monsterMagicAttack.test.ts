import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateMonsterAttack,
  getMagicDefenseContribution,
  DAMAGE_REDUCTION_CAP,
  MAGIC_DEFENSE_CONTRIBUTION_CAP,
  BASE_CHARACTER_DEFENSE,
} from '../combat';
import { getMagicResist } from '../../models/character';
import { isRangedAttackType } from '../../models/monster';
import { MONSTER_SEEDS } from '../../db/seed/monsterSeeds';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';

const WIZARDS = ['妖魔咒術師', '妖魔祭司', '鏡湖歌者', '象牙巫師', '象牙魔導師', '暗影巫師', '不死巫妖', '霜凍女巫', '精靈王魔導士'];

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

function monster(attackType: 'melee' | 'magic', atk: number): MonsterInstance {
  return {
    templateId: 1, name: '測試怪', level: 50, currentHp: 100, maxHp: 100,
    attackMin: atk, attackMax: atk, defense: 0, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType, attackRange: attackType === 'magic' ? 8 : 1.5, attackInterval: 1000,
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

describe('魔法抗性（§ 20.3）', () => {
  it('= floor(有效SPI / 2)', () => {
    expect(getMagicResist(10)).toBe(5);
    expect(getMagicResist(11)).toBe(5);   // 有效SPI 10
    expect(getMagicResist(18)).toBe(9);
    expect(getMagicResist(35)).toBe(17);  // 有效SPI 34
  });

  it('SPI 0~1 時為 0', () => {
    expect(getMagicResist(0)).toBe(0);
    expect(getMagicResist(1)).toBe(0);
  });
});

describe('怪物魔法攻擊減傷（§ 21.16）', () => {
  it('物理維持 min(防禦, 75)，不吃魔抗', () => {
    noRandom();
    // 防禦 60、SPI 18（魔抗 9）：物理減傷應為 60%
    const r = calculateMonsterAttack(monster('melee', 100), char(18), [armor(60)], []);
    expect(r.damage).toBe(Math.floor(100 * (100 - 60) / 100));
  });

  it('魔法：裝備防禦每 10 點 1%', () => {
    noRandom();
    // 防禦 60 → 貢獻 6；魔抗 9 → 總減傷 15%
    const r = calculateMonsterAttack(monster('magic', 100), char(18), [armor(60)], []);
    expect(r.damage).toBe(85);
  });

  it('魔法：不滿 10 點照比例計', () => {
    noRandom();
    // 防禦 45 → 貢獻 4.5；魔抗 9 → 13.5%
    const r = calculateMonsterAttack(monster('magic', 100), char(18), [armor(45)], []);
    expect(r.damage).toBe(Math.floor(100 * (100 - 13.5) / 100));
  });

  it('裝備防禦的貢獻上限為 10%（防禦 100 封頂）', () => {
    expect(MAGIC_DEFENSE_CONTRIBUTION_CAP).toBe(10);
    expect(getMagicDefenseContribution(100)).toBe(10);
    expect(getMagicDefenseContribution(200)).toBe(10);
    expect(getMagicDefenseContribution(75)).toBe(7.5);
    expect(getMagicDefenseContribution(60)).toBe(6);
    expect(getMagicDefenseContribution(45)).toBe(4.5);
    expect(getMagicDefenseContribution(0)).toBe(0);
  });

  it('魔法：總減傷上限仍為 75%', () => {
    noRandom();
    // 防禦 200 → 貢獻 10；SPI 140 → 魔抗 70；合計 80 → clamp 至 75
    const r = calculateMonsterAttack(monster('magic', 100), char(140), [armor(200)], []);
    expect(r.damage).toBe(Math.floor(100 * (100 - DAMAGE_REDUCTION_CAP) / 100));
  });

  it('魔抗為 0 時，魔法減傷只剩防禦貢獻', () => {
    noRandom();
    const gear = [armor(70)];
    const phys = calculateMonsterAttack(monster('melee', 100), char(0), gear, []).damage;
    const magic = calculateMonsterAttack(monster('magic', 100), char(0), gear, []).damage;
    expect(phys).toBe(Math.floor(100 * (100 - 70) / 100));
    expect(magic).toBe(93);
    expect(magic).toBeGreaterThan(phys);
  });

  it('傷害最低仍為 1', () => {
    noRandom();
    const r = calculateMonsterAttack(monster('magic', 1), char(80), [armor(200)], []);
    expect(r.damage).toBeGreaterThanOrEqual(1);
  });
});

describe('魔法怪 seed 設定', () => {
  const magicSeeds = MONSTER_SEEDS.filter(m => m.attackType === 'magic');

  it('僅巫師／魔導系 9 種怪物，共 12 筆', () => {
    expect(magicSeeds).toHaveLength(12);
    expect([...new Set(magicSeeds.map(m => m.name))].sort()).toEqual([...WIZARDS].sort());
  });

  it('射程一律 8 格', () => {
    for (const m of magicSeeds) expect(m.attackRange, m.name).toBe(8);
  });

  it('元素系維持近戰（未被誤標）', () => {
    const elementals = MONSTER_SEEDS.filter(m => /元素$/.test(m.name));
    expect(elementals.length).toBeGreaterThan(0);
    for (const m of elementals) expect(m.attackType, m.name).toBeUndefined();
  });

  it('magic 與 ranged 都需要射程與視線判定', () => {
    expect(isRangedAttackType('magic')).toBe(true);
    expect(isRangedAttackType('ranged')).toBe(true);
    expect(isRangedAttackType('melee')).toBe(false);
    expect(isRangedAttackType(undefined)).toBe(false);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
