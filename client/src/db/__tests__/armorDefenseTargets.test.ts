import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import type { ClassName } from '../../models/character';
import type { EquipSlot } from '../../models/equipment';

/**
 * 防具防禦目標（`06-equipment-balance.md` § 6A.8.7）。
 *
 * 目標定義為「頭＋胸＋手＋腳＋左手五件**全部強化到 +4**」的防禦總和。
 * 防具強化每 +1 給 1 點防禦（§ 6.10），五件 +4 固定貢獻 +20，
 * 因此 T1 的地板落在 24~26，壓不到 20 —— 那是 +4 本身撐起來的。
 */
const ENHANCE_BONUS = 4 * 5;
const DEFENSE_SLOTS: EquipSlot[] = ['helmet', 'chest', 'gloves', 'boots', 'leftHand'];

/**
 * 全套 +4 的防禦目標（T2~T7）。
 * **防具沒有 T1** —— 新手裝已經涵蓋那個量級，商店的防具從 T2 開始賣（§ 6A.8.8）。
 */
const ARMOR_MIN_TIER = 2;
const TARGET: Record<ClassName, number[]> = {
  knight: [40, 50, 60, 70, 80, 90],
  elf: [39, 48, 56, 65, 73, 82],
  thief: [39, 48, 56, 65, 73, 82],
  elementalist: [38, 46, 54, 62, 69, 77],
  priest: [38, 46, 54, 62, 69, 77],
};
const TIERS = [2, 3, 4, 5, 6, 7];

const REAL = EQUIPMENT_SEEDS.filter(t => t.acquireType !== 'starter' && t.tier);

function bestDefense(cls: ClassName, slot: EquipSlot, tier: number): number {
  return Math.max(0, ...REAL
    .filter(t => t.tier === tier && t.slot === slot
      && (!t.requiredClass || (t.requiredClass as ClassName[]).includes(cls)))
    .map(t => t.defense ?? 0));
}

describe('防具防禦目標（§ 6A.8.7）', () => {
  it.each(Object.keys(TARGET) as ClassName[])('%s 每階全套 +4 的防禦命中目標', cls => {
    const actual = TIERS.map(tier =>
      DEFENSE_SLOTS.reduce((sum, slot) => sum + bestDefense(cls, slot, tier), 0) + ENHANCE_BONUS);
    expect(actual).toEqual(TARGET[cls]);
  });

  it('防禦最高的是騎士、最低的是布甲職業', () => {
    const total = (cls: ClassName, tier: number) =>
      DEFENSE_SLOTS.reduce((sum, slot) => sum + bestDefense(cls, slot, tier), 0);
    for (const tier of TIERS) {
      expect(total('knight', tier)).toBeGreaterThanOrEqual(total('elf', tier));
      expect(total('elf', tier)).toBeGreaterThanOrEqual(total('elementalist', tier));
    }
  });

  it('左手裝備的防禦封頂在 8，不得再變成第二套防具', () => {
    // 原本封在 4，但新手盾本身就有 4 防，整條商店線都買不到更好的盾。
    // 放寬到 8 仍只佔 T7 全身 62 點的 11%。
    const over = REAL
      .filter(t => t.slot === 'leftHand' && t.acquireType !== 'starter' && (t.defense ?? 0) > 8)
      .map(t => `${t.name}(${t.defense})`);
    expect(over).toEqual([]);
  });

  // T1~T2 的防禦目標只有 1~3 點，三種定位的落差表達不出來，硬湊第三件只會產出
  // 被完全支配的廢品（例：T1 頭盔「1 防、零附加」對上「1 防、+1 屬性」）。§ 6A.8.3
  const minOptions = (tier: number) => (tier === 2 ? 1 : tier === 3 ? 2 : 3);

  it('每個職業每個防禦部位每階至少有 1~3 件可選', () => {
    const gaps: string[] = [];
    for (const cls of Object.keys(TARGET) as ClassName[]) {
      for (const slot of DEFENSE_SLOTS) {
        for (const tier of TIERS) {
          const n = REAL.filter(t => t.tier === tier && t.slot === slot
            && (!t.requiredClass || (t.requiredClass as ClassName[]).includes(cls))).length;
          if (n < minOptions(tier)) gaps.push(`${cls} ${slot} T${tier}: ${n}`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it('回血／回魔不超過部位上限，鞋子不給回復（§ 6A.8.8）', () => {
    const CAP: Record<string, number> = { helmet: 5, chest: 15, gloves: 2, boots: 0, leftHand: 3 };
    const over = REAL
      .filter(t => CAP[t.slot] !== undefined)
      .filter(t => (t.hpRegen ?? 0) > CAP[t.slot] || (t.mpRegen ?? 0) > CAP[t.slot])
      .map(t => `${t.name}(${t.slot} 回血${t.hpRegen ?? 0}/回魔${t.mpRegen ?? 0} > ${CAP[t.slot]})`);
    expect(over).toEqual([]);
  });

  it('HP／MP 不超過部位上限（§ 6A.8.8）', () => {
    const HP: Record<string, number> = { helmet: 40, chest: 100, gloves: 20, boots: 30, leftHand: 30 };
    const MP: Record<string, number> = { helmet: 60, chest: 60, gloves: 20, boots: 20, leftHand: 30 };
    const over = REAL
      .filter(t => HP[t.slot] !== undefined)
      .filter(t => (t.bonusHp ?? 0) > HP[t.slot] || (t.bonusMp ?? 0) > MP[t.slot])
      .map(t => `${t.name}(${t.slot} HP${t.bonusHp ?? 0}/MP${t.bonusMp ?? 0})`);
    expect(over).toEqual([]);
  });

  it('T4 以上每個 (職業, 部位, 階級) 三種定位都湊得齊（§ 6A.8.8）', () => {
    const roleOf = (t: (typeof REAL)[number]) =>
      t.bonusAttributes ? '屬性' : (t.hpRegen || t.mpRegen || t.bonusHp || t.bonusMp) ? '續戰' : '防禦';
    const missing: string[] = [];
    for (const cls of Object.keys(TARGET) as ClassName[]) {
      for (const slot of DEFENSE_SLOTS) {
        for (let tier = 4; tier <= 7; tier++) {
          const roles = new Set(REAL
            .filter(t => t.tier === tier && t.slot === slot
              && (!t.requiredClass || (t.requiredClass as ClassName[]).includes(cls)))
            .map(roleOf));
          if (roles.size < 3) missing.push(`${cls} ${slot} T${tier}: ${[...roles].join('/')}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('同一條路線同一部位下，不同階級不得出現素質完全相同的裝備', () => {
    // 以 requiredClass 相同者視為同一條路線。跨路線的數值巧合不算問題
    // （例：布甲 T3 手套與輕甲 T2 手套同為 2 防，但各自服務不同職業）。
    const stats = (t: (typeof REAL)[number]) => JSON.stringify([
      t.defense ?? 0, t.hpRegen ?? 0, t.mpRegen ?? 0, t.bonusHp ?? 0, t.bonusMp ?? 0,
      t.blockRate ?? 0, t.magicAttack ?? 0, t.bonusAttributes ?? null,
    ]);
    const lineOf = (t: (typeof REAL)[number]) =>
      [...((t.requiredClass as string[]) ?? ['*'])].sort().join(',');
    const clashes: string[] = [];
    const seen = new Map<string, { name: string; tier: number }>();
    // T1~T2 是純防禦且數值只有 1~5 點，同值無可避免，不列入檢查
    for (const t of REAL.filter(x => DEFENSE_SLOTS.includes(x.slot) && (x.tier ?? 0) >= 3)) {
      const key = `${lineOf(t)}|${t.slot}|${stats(t)}`;
      const prev = seen.get(key);
      // 同階可以有同素質的件；跨階相同代表升級毫無意義
      if (prev && prev.tier !== t.tier) {
        clashes.push(`${t.slot}: ${prev.name}(T${prev.tier}) = ${t.name}(T${t.tier})`);
      } else if (!prev) {
        seen.set(key, { name: t.name, tier: t.tier! });
      }
    }
    expect(clashes).toEqual([]);
  });

  it('防具沒有 T1', () => {
    const t1 = REAL.filter(t => t.tier === 1 && DEFENSE_SLOTS.includes(t.slot)).map(t => t.name);
    expect(t1).toEqual([]);
  });

  it('商店第一階（T2）的每個部位都嚴格優於新手裝', () => {
    const worse: string[] = [];
    for (const cls of Object.keys(TARGET) as ClassName[]) {
      for (const slot of DEFENSE_SLOTS) {
        const avail = (list: typeof EQUIPMENT_SEEDS) => list.filter(t => t.slot === slot
          && (!t.requiredClass || (t.requiredClass as ClassName[]).includes(cls)));
        const starter = Math.max(0, ...avail(EQUIPMENT_SEEDS.filter(t => t.acquireType === 'starter'))
          .map(t => t.defense ?? 0));
        const t2 = Math.max(0, ...avail(REAL.filter(t => t.tier === ARMOR_MIN_TIER)).map(t => t.defense ?? 0));
        if (starter && t2 <= starter) worse.push(`${cls} ${slot}: 新手裝 ${starter} ≥ T2 ${t2}`);
      }
    }
    expect(worse).toEqual([]);
  });

  it('商店售價落在該階區間內，且與素質同向（§ 6A.8.9）', () => {
    const RANGE: Record<string, Record<number, [number, number]>> = {
      armor: { 2: [5000, 8000], 3: [9000, 15000] },
      weapon: { 2: [5000, 7000], 3: [8000, 10000] },
    };
    const SKIP = ['belt', 'necklace', 'ring1', 'ring2'];
    const bad: string[] = [];
    for (const t of REAL.filter(x => x.acquireType === 'shop' && !SKIP.includes(x.slot))) {
      const kind = DEFENSE_SLOTS.includes(t.slot) ? 'armor' : 'weapon';
      const range = RANGE[kind][t.tier!];
      if (!range) { bad.push(`${t.name}: T${t.tier} 沒有定價區間`); continue; }
      const price = t.buyPrice ?? 0;
      if (price < range[0] || price > range[1]) {
        bad.push(`${t.name}(T${t.tier} ${kind}): ${price} 不在 ${range[0]}~${range[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('項鍊、戒指不提供防禦（素質另案討論）', () => {
    const withDefense = REAL
      .filter(t => ['necklace', 'ring1', 'ring2'].includes(t.slot) && (t.defense ?? 0) > 0)
      .map(t => t.name);
    expect(withDefense).toEqual([]);
  });

  it('腰帶：T1~T5 不給防禦，T6 起給 1 點（§ 6A.8.10）', () => {
    const bad = REAL
      .filter(t => t.slot === 'belt')
      .filter(t => (t.defense ?? 0) !== (t.tier! >= 6 ? 1 : 0))
      .map(t => `${t.name}(T${t.tier} 防${t.defense ?? 0})`);
    expect(bad).toEqual([]);
  });

  it('腰帶的背包格數逐階遞增（§ 35.1）', () => {
    const SLOTS = [5, 6, 8, 10, 15, 18, 20];
    const bad = REAL
      .filter(t => t.slot === 'belt' && t.bonusBagSlots !== SLOTS[t.tier! - 1])
      .map(t => `${t.name}(T${t.tier} ${t.bonusBagSlots} 格)`);
    expect(bad).toEqual([]);
  });
});
