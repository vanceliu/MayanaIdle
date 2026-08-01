import { describe, it, expect, vi, afterEach } from 'vitest';
import { pickEquipmentCategory, scaleDropValue } from '../drops';
import { DROP_TABLE_SEEDS } from '../../db/seed/dropSeeds';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { isWeaponSlot } from '../../models/equipment';

describe('裝備掉落的類別抽取（§ 27.3）', () => {
  const mixed = [
    { slot: 'rightHand' }, { slot: 'rightHand' }, { slot: 'rightHand' },
    { slot: 'chest' },
  ];

  it('roll < 0.5 抽武器側', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    expect(pickEquipmentCategory(mixed).every(t => isWeaponSlot(t.slot as any))).toBe(true);
  });

  it('roll >= 0.5 抽防具側', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8);
    expect(pickEquipmentCategory(mixed).every(t => !isWeaponSlot(t.slot as any))).toBe(true);
  });

  it('類別機率為 1/2，不受兩側數量懸殊影響', () => {
    // 3 武器 vs 1 防具：混合池均勻抽會是 75% / 25%
    let weaponSide = 0;
    for (let i = 0; i < 1000; i++) {
      const picked = pickEquipmentCategory(mixed);
      if (isWeaponSlot(picked[0].slot as any)) weaponSide++;
    }
    expect(weaponSide).toBeGreaterThan(400);
    expect(weaponSide).toBeLessThan(600);
  });

  it('單邊為空時退回另一邊', () => {
    const onlyWeapons = [{ slot: 'rightHand' }, { slot: 'leftHand' }];
    expect(pickEquipmentCategory(onlyWeapons)).toHaveLength(2);
    const onlyArmors = [{ slot: 'chest' }, { slot: 'boots' }];
    expect(pickEquipmentCategory(onlyArmors)).toHaveLength(2);
  });

  it('迴歸：shop/high 池武器 16 vs 防具 1，混合均勻抽會有 94% 偏斜', () => {
    const pool = EQUIPMENT_SEEDS.filter(t => t.acquireType === 'shop' && t.shopTier === 'high');
    const weapons = pool.filter(t => isWeaponSlot(t.slot)).length;
    const armors = pool.length - weapons;
    expect(weapons).toBeGreaterThan(armors * 5);   // 確認偏斜確實存在
    // 類別抽取後兩側機率相等，與數量無關
    vi.spyOn(Math, 'random').mockReturnValue(0.8);
    expect(pickEquipmentCategory(pool).every(t => !isWeaponSlot(t.slot))).toBe(true);
  });
});

describe('掉落值等級縮放（§ 27.3）', () => {
  it('無 dropValueMax 時維持固定值', () => {
    expect(scaleDropValue(80, undefined, 45, 40, 50)).toBe(80);
  });

  it('區域最低等級 → 下限', () => {
    expect(scaleDropValue(50, 100, 30, 30, 40)).toBe(50);
  });

  it('區域最高等級 → 上限', () => {
    expect(scaleDropValue(50, 100, 40, 30, 40)).toBe(100);
  });

  it('區域中段 → 線性內插', () => {
    expect(scaleDropValue(50, 100, 35, 30, 40)).toBe(75);
  });

  it('超出區域範圍時 clamp', () => {
    expect(scaleDropValue(50, 100, 10, 30, 40)).toBe(50);
    expect(scaleDropValue(50, 100, 99, 30, 40)).toBe(100);
  });

  it('max <= base 時不縮放', () => {
    expect(scaleDropValue(80, 80, 45, 40, 50)).toBe(80);
    expect(scaleDropValue(80, 50, 45, 40, 50)).toBe(80);
  });
});

describe('橙色藥水的 5~10%（§ 27.1）', () => {
  const ORANGE_POTION_ID = 2;
  const entries = DROP_TABLE_SEEDS.filter(d => d.itemTemplateId === ORANGE_POTION_ID);

  it('所有橙色藥水掉落列都帶 dropValueMax: 100', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.dropValueMax, e.area).toBe(100);
    }
  });

  it('縮放後最高可達 10%（掉落值 100）', () => {
    const e = entries[0];
    expect(scaleDropValue(e.dropValue, e.dropValueMax, 40, 30, 40)).toBe(100);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
