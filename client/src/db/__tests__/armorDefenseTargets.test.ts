import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import { ARMOR_LINE_ATTRIBUTES, getArmorRequirement } from '../../models/equipment';
import { ATTRIBUTE_KEYS } from '../../models/character';
import type { ArmorLine, EquipSlot, EquipmentTier } from '../../models/equipment';
import type { ClassName } from '../../models/character';

/**
 * 防具規格（`06-equipment.md` § 6A.8.8）。
 *
 * 全套防禦目標＝「該階能穿到的防具**全部強化到平均值**」的期望總和。
 * 一件的實際防禦是三段：基礎固定值 + 隨機額外(+0~+2) + 強化等級，
 * 後兩段在實例生成時決定，seed 只有基礎。因此驗算時要補回
 * 「平均隨機 +1／件」與「平均強化 +5／件」（安定值抽 4~6）。
 */
const AVG_DEFENSE_BONUS = 1;
const AVG_ENHANCE = 5;
const NEW_SLOT_MIN_TIER = 4;
/** T4 起開放的兩個部位（§ 6A.8.9） */
const NEW_SLOTS: EquipSlot[] = ['shirt', 'cloak'];
/** 四件套（不含左手與新部位） */
const ARMOR_SLOTS: EquipSlot[] = ['helmet', 'chest', 'gloves', 'boots'];
/** 計入全套目標的所有防具部位 */
const DEFENSE_SLOTS: EquipSlot[] = ['helmet', 'chest', 'shirt', 'cloak', 'gloves', 'boots', 'leftHand'];
const LINES: ArmorLine[] = ['heavy', 'light', 'robe'];
const TIERS = [2, 3, 4, 5, 6, 7];
const ARMOR_MIN_TIER = 2;

const SUIT_TARGET: Record<ArmorLine, number[]> = {
  heavy: [42, 50, 62, 69, 76, 82],
  light: [41, 49, 60, 66, 71, 76],
  robe: [40, 47, 57, 62, 66, 71],
};

const REAL = EQUIPMENT_SEEDS.filter(t => t.acquireType !== 'starter' && t.tier);
const STARTER = EQUIPMENT_SEEDS.filter(t => t.acquireType === 'starter');
const armorAt = (line: ArmorLine, slot: EquipSlot, tier: number) =>
  REAL.filter(t => t.line === line && t.slot === slot && t.tier === tier);
const wearableSlots = (tier: number) =>
  DEFENSE_SLOTS.filter(s => tier >= NEW_SLOT_MIN_TIER || !NEW_SLOTS.includes(s));

describe('防具全套防禦目標（§ 6A.8.8）', () => {
  it.each(LINES)('%s 每階的基礎防禦加上平均隨機與平均強化後命中目標', line => {
    const actual = TIERS.map(tier => {
      const slots = wearableSlots(tier);
      const base = slots.reduce((sum, slot) =>
        sum + Math.max(0, ...armorAt(line, slot, tier).map(t => t.defense ?? 0)), 0);
      return base + slots.length * (AVG_DEFENSE_BONUS + AVG_ENHANCE);
    });
    expect(actual).toEqual(SUIT_TARGET[line]);
  });

  it('同階同部位一律 重 ≥ 輕 ≥ 布', () => {
    const bad: string[] = [];
    for (const slot of DEFENSE_SLOTS) {
      for (const tier of TIERS) {
        const [h, l, r] = LINES.map(line =>
          Math.max(0, ...armorAt(line, slot, tier).map(t => t.defense ?? 0)));
        if (h < l || l < r) bad.push(`${slot} T${tier}: 重${h} 輕${l} 布${r}`);
      }
    }
    expect(bad).toEqual([]);
  });

  // 強化的貢獻是常數（T2~T3 五件 25、T4 起七件 35），所以占比隨階級遞減。
  // 底部落在 T7 重甲的 35/82，頂部在 T2 布甲的 25/40。
  it('強化在全套目標裡的占比落在 42%~63%', () => {
    for (const line of LINES) {
      TIERS.forEach((tier, i) => {
        const share = wearableSlots(tier).length * AVG_ENHANCE / SUIT_TARGET[line][i];
        expect(share).toBeGreaterThanOrEqual(0.42);
        expect(share).toBeLessThanOrEqual(0.63);
      });
    }
  });
});

describe('防具名額：每（部位 × 階級）布／輕／重各一件（§ 6A.8.8）', () => {
  it('T2~T7 每個部位恰好三件，三條路線各一', () => {
    const bad: string[] = [];
    for (const slot of DEFENSE_SLOTS) {
      for (const tier of TIERS) {
        if (NEW_SLOTS.includes(slot) && tier < NEW_SLOT_MIN_TIER) continue;
        const here = REAL.filter(t => t.slot === slot && t.tier === tier);
        const lines = here.map(t => t.line).sort().join(',');
        if (here.length !== 3 || lines !== 'heavy,light,robe') {
          bad.push(`${slot} T${tier}: ${here.length} 件 [${lines}]`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('左手三種各對應一條路線：盾牌＝重、臂甲＝輕、魔導書＝布', () => {
    const WANT: Record<string, ArmorLine> = { shield: 'heavy', armGuard: 'light', magicBook: 'robe' };
    const bad = REAL
      .filter(t => t.slot === 'leftHand')
      .filter(t => t.line !== WANT[String(t.type)])
      .map(t => `${t.name}(${t.type}) = ${t.line}`);
    expect(bad).toEqual([]);
  });

  it('防具沒有 T1（新手裝已涵蓋那個量級）', () => {
    expect(REAL.filter(t => t.tier === 1 && DEFENSE_SLOTS.includes(t.slot)).map(t => t.name)).toEqual([]);
  });
});

describe('素質需求（§ 6A.8.8）', () => {
  it('每件的需求照路線與階級的階梯', () => {
    const bad: string[] = [];
    for (const t of REAL.filter(x => x.line)) {
      const want = getArmorRequirement(t.line!, t.tier as EquipmentTier);
      if (JSON.stringify(t.requiredAttributes ?? {}) !== JSON.stringify(want)) {
        bad.push(`${t.name}: ${JSON.stringify(t.requiredAttributes)} ≠ ${JSON.stringify(want)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('主需求 T2~T7 為 10/12/14/16/18/24，第二需求 T4 起為 12/14/16/18', () => {
    for (const line of LINES) {
      const { primary, secondary } = ARMOR_LINE_ATTRIBUTES[line];
      expect(TIERS.map(t => getArmorRequirement(line, t as EquipmentTier)[primary]))
        .toEqual([10, 12, 14, 16, 18, 24]);
      expect(TIERS.map(t => getArmorRequirement(line, t as EquipmentTier)[secondary]))
        .toEqual([undefined, undefined, 12, 14, 16, 18]);
    }
  });

  it('T6 的主需求剛好是建角配點的單項上限 18，T7 只有 Lv51+ 碰得到', () => {
    expect(getArmorRequirement('heavy', 6).STR).toBe(18);
    expect(getArmorRequirement('heavy', 7).STR).toBeGreaterThan(18);
  });

  it('防具沒有職業限制 —— 只有魔導書與臂甲例外（§ 6.6）', () => {
    const OFFHAND_CLASSES: Record<string, string[]> = {
      magicBook: ['elementalist', 'priest'],
      armGuard: ['thief'],
    };
    const bad = REAL
      .filter(t => t.line)
      .filter(t => JSON.stringify(t.requiredClass ?? null)
        !== JSON.stringify(OFFHAND_CLASSES[String(t.type)] ?? null))
      .map(t => `${t.name}(${t.type}) = ${JSON.stringify(t.requiredClass)}`);
    expect(bad).toEqual([]);
  });

  it('盾牌全職業，魔導書限法系，臂甲限盜賊', () => {
    const classesOf = (type: string) => REAL
      .filter(t => t.slot === 'leftHand' && t.type === type)
      .map(t => JSON.stringify(t.requiredClass ?? null));
    expect(new Set(classesOf('shield'))).toEqual(new Set(['null']));
    expect(new Set(classesOf('magicBook'))).toEqual(new Set(['["elementalist","priest"]']));
    expect(new Set(classesOf('armGuard'))).toEqual(new Set(['["thief"]']));
  });
});

describe('防具模板不再帶的欄位（§ 6A.8.8、§ 6.10）', () => {
  const lined = REAL.filter(t => t.line);

  it('回血／回魔／HP／MP 一律不在模板上（改走詞綴）', () => {
    const bad = lined
      .filter(t => t.hpRegen || t.mpRegen || t.bonusHp || t.bonusMp)
      .map(t => t.name);
    expect(bad).toEqual([]);
  });

  it('額外屬性一律不在模板上（改走額外屬性詞綴）', () => {
    expect(lined.filter(t => t.bonusAttributes || t.bonusStats).map(t => t.name)).toEqual([]);
  });

  it('安定值不在模板上（改為實例生成時抽 4~6）', () => {
    expect(lined.filter(t => t.stability !== undefined).map(t => t.name)).toEqual([]);
  });
});

describe('上衣與斗篷（§ 6A.8.9）', () => {
  it('T4 起才有，T1~T3 完全沒有可穿的件', () => {
    const early = REAL.filter(t => NEW_SLOTS.includes(t.slot) && t.tier! < NEW_SLOT_MIN_TIER);
    expect(early.map(t => t.name)).toEqual([]);
  });

  it('商店買不到，也沒有新手裝', () => {
    const bad = EQUIPMENT_SEEDS
      .filter(t => NEW_SLOTS.includes(t.slot))
      .filter(t => t.acquireType === 'shop' || t.acquireType === 'starter')
      .map(t => `${t.name}(${t.acquireType})`);
    expect(bad).toEqual([]);
  });
});

describe('防禦曲線', () => {
  // T4 是上衣與斗篷的開放階：可穿件從五件變七件，固定加成從 30 變 42，
  // 舊五件的基礎總量因此必須下修。真正要守住的是「開放階之後不再倒退」。
  it('開放階之後跨階不倒退', () => {
    const drops: string[] = [];
    for (const line of LINES) {
      for (const slot of DEFENSE_SLOTS) {
        let prev = 0;
        for (const tier of TIERS.filter(t => t >= NEW_SLOT_MIN_TIER)) {
          const best = Math.max(0, ...armorAt(line, slot, tier).map(t => t.defense ?? 0));
          if (best < prev) drops.push(`${line} ${slot} T${tier}: ${prev} → ${best}`);
          prev = best;
        }
      }
    }
    expect(drops).toEqual([]);
  });

  it('T2 → T3 不倒退', () => {
    const drops: string[] = [];
    for (const line of LINES) {
      for (const slot of ARMOR_SLOTS) {
        const t2 = Math.max(0, ...armorAt(line, slot, 2).map(t => t.defense ?? 0));
        const t3 = Math.max(0, ...armorAt(line, slot, 3).map(t => t.defense ?? 0));
        if (t3 < t2) drops.push(`${line} ${slot}: ${t2} → ${t3}`);
      }
    }
    expect(drops).toEqual([]);
  });

  // 防具不再限職業，所以「買得到的最好一件」對每個職業都一樣，逐部位比即可
  it('商店第一階（T2）的每個部位都嚴格優於新手裝', () => {
    const worse: string[] = [];
    for (const slot of DEFENSE_SLOTS) {
      const starter = Math.max(0, ...STARTER.filter(t => t.slot === slot).map(t => t.defense ?? 0));
      const t2 = Math.max(0, ...REAL.filter(t => t.slot === slot && t.tier === ARMOR_MIN_TIER)
        .map(t => t.defense ?? 0));
      if (starter && t2 <= starter) worse.push(`${slot}: 新手裝 ${starter} ≥ T2 ${t2}`);
    }
    expect(worse).toEqual([]);
  });
});

describe('不受本次改版影響的部位', () => {
  it('商店售價落在該階區間內（`06-equipment-acquire.md` § 6A.2）', () => {
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

  it('項鍊、戒指不提供防禦', () => {
    const withDefense = REAL
      .filter(t => ['necklace', 'ring1', 'ring2'].includes(t.slot) && (t.defense ?? 0) > 0)
      .map(t => t.name);
    expect(withDefense).toEqual([]);
  });

  it('腰帶：T1~T5 不給防禦，T6 起給 1 點（`35-inventory-constraints.md` § 35.1）', () => {
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

  it('新手裝仍是職業專屬，且沒有素質需求', () => {
    const armorStarters = STARTER.filter(t => DEFENSE_SLOTS.includes(t.slot));
    expect(armorStarters.length).toBeGreaterThan(0);
    expect(armorStarters.filter(t => t.requiredAttributes).map(t => t.name)).toEqual([]);
  });
});

// 型別導入的存活確認：ClassName／ATTRIBUTE_KEYS 供未來擴充用，避免 lint 誤刪
void (null as unknown as ClassName);
void ATTRIBUTE_KEYS;
