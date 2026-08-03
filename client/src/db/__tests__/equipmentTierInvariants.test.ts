import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../seed/dropSeeds';
import { MIN_SHOP_TIER, MAX_SHOP_TIER, MONSTER_DROP_ONLY_TIER, BOSS_DROP_ONLY_TIER } from '../../models/equipment';
import { getTierGroup } from '../../models/equipmentTier';
import type { EquipmentTemplate } from '../../models/equipment';

/**
 * 裝備階級 tier 1~7 的結構性不變式（`06-equipment-balance.md` § 6A.8）。
 *
 * 這些測試取代舊的「人工檢查製作品是否強過商店天花板」——
 * 只要 tier 遞增即代表素質遞增，違反時直接失敗。
 */

const REAL = EQUIPMENT_SEEDS.filter(t => t.acquireType !== 'starter');

/** 該裝備的主要素質指標。鈍器／雙手斧以大怪傷害為準（§ 6A.4） */
function powerOf(t: EquipmentTemplate): number {
  // 左手裝備的防禦刻意封頂在 4（§ 6A.8.7），成長曲線改由格擋率／魔法攻擊承擔
  if (t.type === 'shield' || t.type === 'armGuard') return t.blockRate ?? 0;
  if (t.type === 'magicBook') return t.magicAttack ?? 0;
  if (t.type === 'armor') return t.defense ?? 0;
  if (t.type === 'mace' || t.type === 'twoHandAxe') return t.largeMonsterDamage ?? 0;
  return t.smallMonsterDamage ?? 0;
}

describe('裝備階級 tier 的基本規則', () => {
  it('每件非新手裝備都有 tier', () => {
    const missing = REAL.filter(t => t.tier == null).map(t => t.name);
    expect(missing).toEqual([]);
  });

  it('tier 一律落在 1~7', () => {
    const bad = REAL.filter(t => t.tier! < 1 || t.tier! > 7).map(t => t.name);
    expect(bad).toEqual([]);
  });

  it('商店只賣 T2~T3（T1 是新手裝專屬階級）', () => {
    const outOfRange = REAL
      .filter(t => t.acquireType === 'shop'
        && (t.tier! > MAX_SHOP_TIER || (t.tier! < MIN_SHOP_TIER && t.type !== 'armor')))
      .map(t => `${t.name}(T${t.tier})`);
    expect(outOfRange).toEqual([]);
  });

  it('製作品不會低於 T4', () => {
    const craftTooLow = REAL
      .filter(t => t.acquireType === 'craft' && t.tier! <= MAX_SHOP_TIER)
      .map(t => `${t.name}(T${t.tier})`);
    expect(craftTooLow).toEqual([]);
  });

  it('商店品一律屬於低階分組', () => {
    for (const t of REAL.filter(x => x.acquireType === 'shop')) {
      expect(getTierGroup(t.tier!)).toBe('低階');
    }
  });

  it('舊的 shopTier / craftTier 已完全移除', () => {
    const legacy = REAL.filter(t => t.shopTier != null || t.craftTier != null).map(t => t.name);
    expect(legacy).toEqual([]);
  });
});

describe('掉落池的 tier 標記', () => {
  const poolEntries = [...DROP_TABLE_SEEDS, ...BOSS_DROP_TABLE_SEEDS]
    .filter(d => d.itemType === 'equipment' && d.equipmentPool);

  it('每個裝備池都指定了 tier', () => {
    const missing = poolEntries.filter(d => d.tier == null);
    expect(missing).toEqual([]);
  });

  it('每個掉落池的 tier 都有對應的裝備可抽', () => {
    const tiers = [...new Set(poolEntries.map(d => d.tier!))];
    for (const tier of tiers) {
      const pool = REAL.filter(t => t.tier === tier);
      expect(pool.length, `裝備Tier ${tier} 的掉落池是空的`).toBeGreaterThan(0);
    }
  });

  it('新手裝一律是 Tier 1', () => {
    // 新手裝就是裝備Tier 1（沒有 Tier 0），創角直接穿上整套。
    // 因為它跟掉落池共用 tier 比對，`drops.ts` 必須另外以 acquireType 排除。
    const wrong = EQUIPMENT_SEEDS
      .filter(t => t.acquireType === 'starter' && t.tier !== 1)
      .map(t => `${t.name}(T${t.tier ?? '—'})`);
    expect(wrong).toEqual([]);
  });
});

/**
 * 核心不變式：tier N+1 的素質天花板必須嚴格大於 tier N。
 *
 * 這條規則的目的是從結構上消滅兩類既有缺陷：
 *  1. 「製作入門不如商店天花板」（舊資料：商店 17 傷 vs 製作入門 11 傷）
 *  2. tier 倒置（舊資料：妖精進階 25 > 頂級 22、盜賊進階 19 > 頂級 17）
 *
 */
/**
 * T6/T7 為掉落限定（§ 6A.8.0）：
 *  - T6 僅一般怪物掉落，T7 僅 Boss 掉落
 *  - 鐵匠的製作階梯止於 T5
 *
 */
describe('T6/T7 掉落限定', () => {
  it('鐵匠製作止於 T6', () => {
    // T6 開放了一半可製作（§ 6A.8.0），讓 Lv.57 以上的頂級材料有出口；
    // 掉落池以 tier 比對，所以那些 T6 仍然照掉。T7 維持純 Boss 掉落。
    const tooHigh = REAL
      .filter(t => t.acquireType === 'craft' && t.tier! > MONSTER_DROP_ONLY_TIER)
      .map(t => `${t.name}(T${t.tier})`);
    expect(tooHigh).toEqual([]);
  });

  it('T6 的腰帶／項鍊／戒指不可製作', () => {
    const ACCESSORY = ['belt', 'necklace', 'ring1', 'ring2'];
    const bad = REAL
      .filter(t => t.tier === MONSTER_DROP_ONLY_TIER && ACCESSORY.includes(t.slot)
        && t.acquireType !== 'drop_only')
      .map(t => `${t.name}(${t.acquireType})`);
    expect(bad).toEqual([]);
  });

  it('T6/T7 都不販售，T7 一律 drop_only', () => {
    const sold = REAL
      .filter(t => t.tier! >= MONSTER_DROP_ONLY_TIER && t.acquireType === 'shop')
      .map(t => `${t.name}(T${t.tier})`);
    expect(sold).toEqual([]);
    const t7 = REAL
      .filter(t => t.tier === BOSS_DROP_ONLY_TIER && t.acquireType !== 'drop_only')
      .map(t => `${t.name}(${t.acquireType})`);
    expect(t7).toEqual([]);
  });

  it('可製作的 T6 都有製作費與材料', () => {
    const bad = REAL
      .filter(t => t.tier === MONSTER_DROP_ONLY_TIER && t.acquireType === 'craft')
      .filter(t => !t.craftGold || !t.craftMaterials?.length)
      .map(t => t.name);
    expect(bad).toEqual([]);
  });

  it('T6 與 T7 都有裝備存在', () => {
    expect(REAL.filter(t => t.tier === MONSTER_DROP_ONLY_TIER).length).toBeGreaterThan(0);
    expect(REAL.filter(t => t.tier === BOSS_DROP_ONLY_TIER).length).toBeGreaterThan(0);
  });

  it('T7 只出現在 Boss 掉落表，不出現在一般掉落表', () => {
    const normalPoolTiers = DROP_TABLE_SEEDS
      .filter(d => d.itemType === 'equipment' && d.equipmentPool)
      .map(d => d.tier);
    expect(normalPoolTiers).not.toContain(BOSS_DROP_ONLY_TIER);
  });
});

describe('tier 素質單調遞增', () => {
  it('每個武器類型內，tier N+1 的天花板 > tier N', () => {
    const types = [...new Set(REAL.filter(t => t.type !== 'armor').map(t => t.type))];
    const violations: string[] = [];

    for (const type of types) {
      const byTier = new Map<number, number>();
      for (const t of REAL.filter(x => x.type === type)) {
        byTier.set(t.tier!, Math.max(byTier.get(t.tier!) ?? 0, powerOf(t)));
      }
      const tiers = [...byTier.keys()].sort((a, b) => a - b);
      for (let i = 1; i < tiers.length; i++) {
        const prev = byTier.get(tiers[i - 1])!;
        const cur = byTier.get(tiers[i])!;
        if (cur <= prev) {
          violations.push(`${type}: T${tiers[i]}(${cur}) <= T${tiers[i - 1]}(${prev})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
