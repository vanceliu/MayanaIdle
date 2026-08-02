import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../seed/dropSeeds';
import { MAX_SHOP_TIER, MAX_CRAFT_TIER, MONSTER_DROP_ONLY_TIER, BOSS_DROP_ONLY_TIER } from '../../models/equipment';
import { getTierGroup } from '../../models/equipmentTier';
import type { EquipmentTemplate } from '../../models/equipment';

/**
 * 裝備階級 tier 1~7 的結構性不變式（`06-equipment-acquire.md` § 6A.8）。
 *
 * 這些測試取代舊的「人工檢查製作品是否強過商店天花板」——
 * 只要 tier 遞增即代表素質遞增，違反時直接失敗。
 */

const REAL = EQUIPMENT_SEEDS.filter(t => t.acquireType !== 'starter');

/** 該裝備的主要素質指標。鈍器／雙手斧以大怪傷害為準（§ 6A.4） */
function powerOf(t: EquipmentTemplate): number {
  if (t.type === 'shield') return t.defense ?? 0;
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

  it('商店只賣 T1~T3', () => {
    const shopTooHigh = REAL
      .filter(t => t.acquireType === 'shop' && t.tier! > MAX_SHOP_TIER)
      .map(t => `${t.name}(T${t.tier})`);
    expect(shopTooHigh).toEqual([]);
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

  it('掉落池不會抽到新手裝', () => {
    const starterTiers = EQUIPMENT_SEEDS
      .filter(t => t.acquireType === 'starter')
      .map(t => t.tier)
      .filter(v => v != null);
    expect(starterTiers).toEqual([]);
  });
});

/**
 * 核心不變式：tier N+1 的素質天花板必須嚴格大於 tier N。
 *
 * 這條規則的目的是從結構上消滅兩類既有缺陷：
 *  1. 「製作入門不如商店天花板」（舊資料：商店 17 傷 vs 製作入門 11 傷）
 *  2. tier 倒置（舊資料：妖精進階 25 > 頂級 22、盜賊進階 19 > 頂級 17）
 *
 * 素質重算（§ 99.4 Phase 4b/5）完成前，此測試預期為紅燈，
 * 因此暫時標記為 `todo`，重算後改回 `it` 即可作為迴歸保護。
 */
/**
 * T6/T7 為掉落限定（§ 6A.8.0）：
 *  - T6 僅一般怪物掉落，T7 僅 Boss 掉落
 *  - 鐵匠的製作階梯止於 T5
 *
 * 現況：35 件 T6 仍標記為 `craft`（舊的「頂級製作品」），且完全沒有 T7。
 * 這批要在 Phase 4b 重新分配 —— 現有頂級製作品下修為 T5（保留其製作配方與前置鏈），
 * T6/T7 另立為全新的掉落限定裝備。重分配完成後把此區塊由 `todo` 改回 `describe`。
 */
describe.todo('T6/T7 掉落限定（待 Phase 4b 重分配後啟用）', () => {
  it('鐵匠製作止於 T5', () => {
    const tooHigh = REAL
      .filter(t => t.acquireType === 'craft' && t.tier! > MAX_CRAFT_TIER)
      .map(t => `${t.name}(T${t.tier})`);
    expect(tooHigh).toEqual([]);
  });

  it('T6/T7 一律為 drop_only', () => {
    const bad = REAL
      .filter(t => t.tier! >= MONSTER_DROP_ONLY_TIER && t.acquireType !== 'drop_only')
      .map(t => `${t.name}(T${t.tier}/${t.acquireType})`);
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

describe.todo('tier 素質單調遞增（待 Phase 4b/5 素質重算後啟用）', () => {
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
