import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../seed/dropSeeds';
import { MIN_SHOP_TIER, MAX_SHOP_TIER, MONSTER_DROP_ONLY_TIER, BOSS_DROP_ONLY_TIER } from '../../models/equipment';
import { getTierGroup } from '../../models/equipmentTier';
import type { EquipmentTemplate } from '../../models/equipment';

/**
 * 裝備階級 tier 1~7 的結構性不變式（`06-equipment-acquire.md` § 6A.1）。
 *
 * 這些測試取代舊的「人工檢查製作品是否強過商店天花板」——
 * 只要 tier 遞增即代表素質遞增，違反時直接失敗。
 */

const REAL = EQUIPMENT_SEEDS.filter(t => t.acquireType !== 'starter');

/** 該裝備的主要素質指標。鈍器／雙手斧以大怪傷害為準（§ 6A.4） */
function powerOf(t: EquipmentTemplate): number {
  // 左手裝備的防禦刻意壓低（封頂 8），成長曲線改由格擋率／魔法攻擊承擔
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
    // 新手裝就是裝備 Tier 1（沒有 Tier 0），創角直接穿上整套。
    // 它與掉落池共用 tier 比對，`drops.ts` 必須另外以 acquireType 排除。
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
 * T6/T7 為掉落限定（`06-equipment-acquire.md` § 6A.1）：
 *  - T6 僅一般怪物掉落，T7 僅 Boss 掉落
 *  - 鐵匠的製作階梯止於 T5
 *
 */
describe('T6/T7 掉落限定', () => {
  it('鐵匠製作止於 T6', () => {
    // T6 開放了一半可製作（`06-equipment-acquire.md` § 6A.1），讓 Lv.57 以上的頂級材料有出口；
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

/**
 * 每個武器類型 × 每個 tier **至少 2 把**，T7 例外可為 1 把。
 *
 * 「tier 素質單調遞增」那條逐類型比相鄰階的天花板，**空格沒有資料可比會靜默跳過**，
 * 缺格一律由本條負責。
 */
describe('每類型每階的件數下限', () => {
  const WEAPON_TYPES = [...new Set(REAL.filter(t => t.smallMonsterDamage != null).map(t => t.type))];
  /** T1 是新手裝專屬階級（`06-equipment-acquire.md` § 6A.1），不在此規則內 */
  const TIERS = [2, 3, 4, 5, 6, 7];

  it('沒有任何 (類型 × 階梯) 是空的', () => {
    const empty: string[] = [];
    for (const type of WEAPON_TYPES)
      for (const tier of TIERS)
        if (!REAL.some(t => t.type === type && t.tier === tier)) empty.push(`${type} T${tier}`);
    expect(empty).toEqual([]);
  });

  /**
   * **平衡不准靠新增武器解決**，因此「每類型每階至少 2 把」
   * 只是理想值，不設測試 —— 它只能靠新增達成。硬規則只有「不得為空」（上一條）。
   *
   * 另一條硬規則：**沒人會用的武器不留**。同類型中若有低階武器在
   * 小怪／大怪傷害與命中上完全壓過高階武器，該高階武器要刪掉，不是補數值。
   */
  it('沒有任何武器被同類型的低階武器完全壓過', () => {
    const weapons = REAL.filter(t => t.smallMonsterDamage != null);
    const total = (t: EquipmentTemplate) => ({
      s: (t.smallMonsterDamage ?? 0) + (t.extraAttack ?? 0),
      l: (t.largeMonsterDamage ?? 0) + (t.extraAttack ?? 0),
    });
    const classesOf = (t: EquipmentTemplate) => new Set(t.requiredClass?.length ? t.requiredClass : ['*']);
    const shares = (a: EquipmentTemplate, b: EquipmentTemplate) => {
      const A = classesOf(a), B = classesOf(b);
      return A.has('*') || B.has('*') || [...A].some(x => B.has(x));
    };
    const dominated: string[] = [];
    for (const hi of weapons) {
      const H = total(hi);
      for (const lo of weapons) {
        if (lo.type !== hi.type || lo.tier! >= hi.tier! || !shares(hi, lo)) continue;
        const L = total(lo);
        if ((lo.attackSuccess ?? 0) < (hi.attackSuccess ?? 0)) continue;
        if (L.s >= H.s && L.l >= H.l && (L.s > H.s || L.l > H.l)) {
          dominated.push(`T${hi.tier} ${hi.name} 被 T${lo.tier} ${lo.name} 壓過`);
        }
      }
    }
    expect([...new Set(dominated)]).toEqual([]);
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

  /**
   * 上一條只看 `powerOf()` 的**單一**主軸（鈍器／雙手斧看大怪，其餘看小怪），
   * 因此另一條軸的倒置會整條漏掉 —— 鋼爪 T6 死神之爪 L12 vs T7 虛空之爪 L11
   * 就是這樣溜過去的：T7 招牌鋼爪打大怪比 T6 弱。
   *
   * 這裡補上「兩條軸都不得倒置」。**打平是允許的**（現有資料有 5 處次要軸打平：
   * 匕首 T3→T4、單手鈍器 T1→T2 與 T4→T5、弓 T3→T4 與 T6→T7），
   * 嚴格遞增仍只要求主軸，由上一條負責。
   */
  it('每個武器類型內，小怪與大怪傷害的天花板都不得倒置', () => {
    const weapons = REAL.filter(t => t.smallMonsterDamage != null);
    const types = [...new Set(weapons.map(t => t.type))];
    const violations: string[] = [];

    for (const type of types) {
      for (const [axis, pick] of [
        ['小怪', (t: EquipmentTemplate) => t.smallMonsterDamage ?? 0],
        ['大怪', (t: EquipmentTemplate) => t.largeMonsterDamage ?? 0],
      ] as const) {
        const byTier = new Map<number, number>();
        for (const t of weapons.filter(x => x.type === type)) {
          byTier.set(t.tier!, Math.max(byTier.get(t.tier!) ?? 0, pick(t)));
        }
        const tiers = [...byTier.keys()].sort((a, b) => a - b);
        for (let i = 1; i < tiers.length; i++) {
          const prev = byTier.get(tiers[i - 1])!;
          const cur = byTier.get(tiers[i])!;
          if (cur < prev) {
            violations.push(`${type} ${axis}: T${tiers[i]}(${cur}) < T${tiers[i - 1]}(${prev})`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
