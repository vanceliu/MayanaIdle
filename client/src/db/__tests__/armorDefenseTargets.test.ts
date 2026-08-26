import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import type { ClassName } from '../../models/character';
import type { EquipSlot } from '../../models/equipment';

/**
 * 防具防禦目標。
 *
 * 目標定義為「該階能穿到的防具**全部強化到 +4**」的防禦總和。
 * T2~T3 是頭胸手腳＋左手五件（+4 共 20），T4 起多了上衣與斗篷，變成七件（+4 共 28）。
 */
const NEW_SLOT_MIN_TIER = 4;
const enhanceBonus = (tier: number) => 4 * (tier >= NEW_SLOT_MIN_TIER ? 7 : 5);
const DEFENSE_SLOTS: EquipSlot[] = ['helmet', 'chest', 'shirt', 'cloak', 'gloves', 'boots', 'leftHand'];
/** 四件套（不含左手與新部位）—— 左手由 `06-equipment-requirement.md` 的武器規格管 */
const ARMOR_SLOTS: EquipSlot[] = ['helmet', 'chest', 'gloves', 'boots'];
/** T4 起開放、全職業共用的兩個部位（§ 6A.8.9） */
const NEW_SLOTS: EquipSlot[] = ['shirt', 'cloak'];

/**
 * 全套 +4 的防禦目標（T2~T7）。
 * **防具沒有 T1** —— 新手裝已經涵蓋那個量級，商店的防具從 T2 開始賣。
 *
 * **妖精 T7 是 81**：`06-equipment-requirement.md` 規定盾牌妖精止於 T6，
 * 妖精又不能用魔導書、臂甲是盜賊專屬，所以妖精在 T7 沒有同階的左手裝備 ——
 * 但目標定義從來沒要求左手同階，妖精 T7 當然是繼續戴 T6 盾（防 7），
 * 四件套 54 ＋ 盾 7 ＋ 五件 +4 的 20 = 81。
 */
const ARMOR_MIN_TIER = 2;
const TARGET: Record<ClassName, number[]> = {
  knight: [40, 50, 60, 70, 80, 90],
  elf: [39, 48, 56, 65, 73, 81],
  thief: [39, 48, 56, 65, 73, 82],
  elementalist: [38, 46, 54, 62, 69, 77],
  priest: [38, 46, 54, 62, 69, 77],
};
const TIERS = [2, 3, 4, 5, 6, 7];

const REAL = EQUIPMENT_SEEDS.filter(t => t.acquireType !== 'starter' && t.tier);

const roleOf = (t: (typeof REAL)[number]) =>
  t.bonusAttributes ? '屬性' : (t.hpRegen || t.mpRegen) ? '續戰' : '防禦';

function bestDefense(cls: ClassName, slot: EquipSlot, tier: number): number {
  return Math.max(0, ...REAL
    .filter(t => t.tier === tier && t.slot === slot
      && (!t.requiredClass || (t.requiredClass as ClassName[]).includes(cls)))
    .map(t => t.defense ?? 0));
}

/**
 * 左手取「該階以下**穿得到**的最好一件」——副手的階梯上限依職業各自不同
 * （`06-equipment-requirement.md`），到頂之後角色不會空手，是繼續戴上一階。
 */
function bestOffhand(cls: ClassName, tier: number): number {
  return Math.max(0, ...TIERS.filter(t => t <= tier).map(t => bestDefense(cls, 'leftHand', t)));
}

describe('防具防禦目標', () => {
  it.each(Object.keys(TARGET) as ClassName[])('%s 每階全套 +4 的防禦命中目標', cls => {
    const actual = TIERS.map(tier =>
      [...ARMOR_SLOTS, ...NEW_SLOTS].reduce((sum, slot) => sum + bestDefense(cls, slot, tier), 0)
      + bestOffhand(cls, tier) + enhanceBonus(tier));
    expect(actual).toEqual(TARGET[cls]);
  });

  // 以**四件套**比較 —— 左手的有無由武器規格決定（妖精 T7 沒有副手），
  // 混進來會讓「重甲 > 輕甲 > 布甲」的比較失去意義。
  it('防禦最高的是騎士、最低的是布甲職業（四件套）', () => {
    const total = (cls: ClassName, tier: number) =>
      ARMOR_SLOTS.reduce((sum, slot) => sum + bestDefense(cls, slot, tier), 0);
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
  // 被完全支配的廢品（例：T1 頭盔「1 防、零附加」對上「1 防、+1 屬性」）。
  // 鞋子沒有續戰型（回復上限 0），T4 起是 5 件而非 8 件，每個職業看得到 2 件
  const minOptions = (slot: EquipSlot, tier: number) =>
    (tier === 2 ? 1 : tier === 3 ? 2 : slot === 'boots' ? 2 : 3);

  it('每個職業每個防禦部位每階至少有 1~3 件可選（不含左手，§ 6A.8.8）', () => {
    const gaps: string[] = [];
    for (const cls of Object.keys(TARGET) as ClassName[]) {
      for (const slot of ARMOR_SLOTS) {
        for (const tier of TIERS) {
          const n = REAL.filter(t => t.tier === tier && t.slot === slot
            && (!t.requiredClass || (t.requiredClass as ClassName[]).includes(cls))).length;
          if (n < minOptions(slot, tier)) gaps.push(`${cls} ${slot} T${tier}: ${n}`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it('回血／回魔不超過部位上限，鞋子與斗篷不給回復（§ 6A.8.8）', () => {
    const CAP: Record<string, number> = {
      helmet: 5, chest: 15, shirt: 5, gloves: 2, boots: 0, cloak: 5, leftHand: 3,
    };
    const over = REAL
      .filter(t => CAP[t.slot] !== undefined)
      .filter(t => (t.hpRegen ?? 0) > CAP[t.slot] || (t.mpRegen ?? 0) > CAP[t.slot])
      .map(t => `${t.name}(${t.slot} 回血${t.hpRegen ?? 0}/回魔${t.mpRegen ?? 0} > ${CAP[t.slot]})`);
    expect(over).toEqual([]);
  });

  // 防具的價值集中在防禦與回復，HP／MP 只來自詞綴與飾品（§ 6A.8.8）
  it('防具一律不提供 HP／MP', () => {
    const over = REAL
      .filter(t => DEFENSE_SLOTS.includes(t.slot))
      .filter(t => (t.bonusHp ?? 0) > 0 || (t.bonusMp ?? 0) > 0)
      .map(t => `${t.name}(${t.slot} HP${t.bonusHp ?? 0}/MP${t.bonusMp ?? 0})`);
    expect(over).toEqual([]);
  });

  // 左手（盾牌／魔導書／臂甲）改由 `06-equipment-requirement.md` 的武器規格決定走向
  // （防禦／SPI／AGI），不套 「防禦／續戰／屬性」三定位。
  // 鞋子的回復上限是 0，防具又不給 HP／MP，續戰型會是空殼，因此鞋子只有兩種定位
  const rolesFor = (slot: EquipSlot) => (slot === 'boots' ? 2 : 3);

  it('T4 以上每個 (職業, 部位, 階級) 的定位都湊得齊（§ 6A.8.8，不含左手）', () => {
    const missing: string[] = [];
    for (const cls of Object.keys(TARGET) as ClassName[]) {
      for (const slot of ARMOR_SLOTS) {
        for (let tier = 4; tier <= 7; tier++) {
          const roles = new Set(REAL
            .filter(t => t.tier === tier && t.slot === slot
              && (!t.requiredClass || (t.requiredClass as ClassName[]).includes(cls)))
            .map(roleOf));
          if (roles.size < rolesFor(slot)) missing.push(`${cls} ${slot} T${tier}: ${[...roles].join('/')}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('屬性型是兩組共用件：重＋輕與輕＋布（§ 6A.8.8）', () => {
    const GROUPS = [
      ['knight', 'elf', 'thief'].join(),
      ['elf', 'thief', 'elementalist', 'priest'].join(),
    ];
    const bad: string[] = [];
    for (const slot of ARMOR_SLOTS) {
      for (let tier = 4; tier <= 7; tier++) {
        const attr = REAL.filter(t => t.tier === tier && t.slot === slot && roleOf(t) === '屬性');
        if (attr.length !== 2) { bad.push(`${slot} T${tier}: ${attr.length} 件屬性型`); continue; }
        const groups = attr.map(t => (t.requiredClass as string[] ?? []).join()).sort();
        if (JSON.stringify(groups) !== JSON.stringify([...GROUPS].sort())) {
          bad.push(`${slot} T${tier}: ${groups.join(' / ')}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  describe('上衣與斗篷（§ 6A.8.9）', () => {
    const at = (slot: EquipSlot, tier: number) => REAL.filter(t => t.slot === slot && t.tier === tier);

    /** 上衣 1／2／2／2；斗篷 3／2／2／1（§ 6A.8.9） */
    const COUNT: Record<string, Record<number, number>> = {
      shirt: { 4: 1, 5: 2, 6: 2, 7: 2 },
      cloak: { 4: 3, 5: 2, 6: 2, 7: 1 },
    };

    it('T4 起才有，件數照規格，全職業共用', () => {
      const bad: string[] = [];
      for (const slot of NEW_SLOTS) {
        for (const tier of TIERS) {
          const items = at(slot, tier);
          const want = tier >= NEW_SLOT_MIN_TIER ? COUNT[slot][tier] : 0;
          if (items.length !== want) bad.push(`${slot} T${tier}: ${items.length} 件（應 ${want}）`);
          for (const t of items.filter(t => t.requiredClass)) bad.push(`${t.name} 不該限職業`);
        }
      }
      expect(bad).toEqual([]);
    });

    it('同階各件同防禦，差異走附加素質', () => {
      const RAMP: Record<string, number[]> = { shirt: [0, 1, 2, 3], cloak: [1, 3, 5, 7] };
      const bad: string[] = [];
      for (const slot of NEW_SLOTS) {
        for (let tier = NEW_SLOT_MIN_TIER; tier <= 7; tier++) {
          for (const t of at(slot, tier)) {
            const want = RAMP[slot][tier - NEW_SLOT_MIN_TIER];
            if ((t.defense ?? 0) !== want) bad.push(`${t.name}: 防 ${t.defense} ≠ ${want}`);
          }
        }
      }
      expect(bad).toEqual([]);
    });

    // T4 上衣不給回復（防禦也是 0），T5 起才分兩件
    it('上衣的回血／回魔照 0／3／4／5，T5 起兩件走向不同', () => {
      const WANT = [0, 3, 4, 5];
      const bad: string[] = [];
      for (let tier = NEW_SLOT_MIN_TIER; tier <= 7; tier++) {
        const shirts = at('shirt', tier);
        const want = WANT[tier - NEW_SLOT_MIN_TIER];
        for (const t of shirts) {
          const regen = Math.max(t.hpRegen ?? 0, t.mpRegen ?? 0);
          if (regen !== want) bad.push(`${t.name}: 回復 ${regen} ≠ ${want}`);
        }
        if (want > 0 && (shirts[0].hpRegen ?? 0) === (shirts[1].hpRegen ?? 0)) {
          bad.push(`上衣 T${tier} 兩件走向相同`);
        }
      }
      expect(bad).toEqual([]);
    });

    // 斗篷的走向逐階指定（§ 6A.8.9），不是統一的「屬性軸」
    it('斗篷的附加素質逐階照表', () => {
      const WANT: Record<number, string[]> = {
        4: ['INT+1', 'STR+1', 'VIT+1'],
        5: ['回魔3', 'VIT+1|回血3'],
        6: ['INT+1|回魔3', 'STR+1'],
        7: ['回血5|回魔5'],
      };
      const describe = (t: (typeof REAL)[number]) => [
        ...Object.entries(t.bonusAttributes ?? {}).map(([k, v]) => `${k}+${v}`),
        ...((t.hpRegen ?? 0) > 0 ? [`回血${t.hpRegen}`] : []),
        ...((t.mpRegen ?? 0) > 0 ? [`回魔${t.mpRegen}`] : []),
      ].join('|');
      const actual: Record<number, string[]> = {};
      for (let tier = NEW_SLOT_MIN_TIER; tier <= 7; tier++) actual[tier] = at('cloak', tier).map(describe);
      expect(actual).toEqual(WANT);
    });

    it('商店買不到，也沒有新手裝', () => {
      const bad = EQUIPMENT_SEEDS
        .filter(t => NEW_SLOTS.includes(t.slot))
        .filter(t => t.acquireType === 'shop' || t.acquireType === 'starter')
        .map(t => `${t.name}(${t.acquireType})`);
      expect(bad).toEqual([]);
    });
  });

  // 同階同素質的件是允許的（差異在詞綴與材質），跨階逐件比較則行不通：
  // T4 是上衣與斗篷的開放階，固定加成從 20 變 28，舊四件的基礎總量必須少 8（§ 6A.8.9），
  // 那一階本來就有部位原地踏步甚至 −1。真正要守住的是「開放階之後不再倒退」。
  it('防禦型的防禦在開放階之後跨階不倒退', () => {
    const drops: string[] = [];
    for (const cls of Object.keys(TARGET) as ClassName[]) {
      for (const slot of [...ARMOR_SLOTS, ...NEW_SLOTS]) {
        let prev = 0;
        for (const tier of TIERS.filter(t => t >= NEW_SLOT_MIN_TIER)) {
          const best = bestDefense(cls, slot, tier);
          if (best === 0) continue;
          if (best < prev) drops.push(`${cls} ${slot} T${tier}: ${prev} → ${best}`);
          prev = best;
        }
      }
    }
    expect(drops).toEqual([]);
  });

  it('T2 → T3 不倒退（開放階之前的曲線沒有動）', () => {
    const drops: string[] = [];
    for (const cls of Object.keys(TARGET) as ClassName[]) {
      for (const slot of ARMOR_SLOTS) {
        if (bestDefense(cls, slot, 3) < bestDefense(cls, slot, 2)) drops.push(`${cls} ${slot}`);
      }
    }
    expect(drops).toEqual([]);
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

  it('商店售價落在該階區間內，且與素質同向（`06-equipment-acquire.md` § 6A.2）', () => {
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
});

/**
 * 左手三種副手的走向由 `06-equipment-requirement.md` 的武器規格決定，不是三定位，
 * 也不由 `rebalanceArmorDefense.mts` 產生 —— 那支腳本會把三種走向洗成同一個屬性。
 */
describe('副手走向（`06-equipment-requirement.md`）', () => {
  const OFFHAND_TYPES = ['shield', 'magicBook', 'armGuard'];
  const at = (type: string, tier: number) =>
    EQUIPMENT_SEEDS.filter(t => t.slot === 'leftHand' && t.type === type
      && t.tier === tier && t.acquireType !== 'starter');

  it('同一階同一種副手的三件，額外屬性走向互不相同', () => {
    const clashes: string[] = [];
    for (const type of OFFHAND_TYPES) {
      for (let tier = 4; tier <= 7; tier++) {
        const seen = new Set<string>();
        for (const t of at(type, tier)) {
          const key = t.bonusStats ?? '無';
          if (seen.has(key)) clashes.push(`${type} T${tier}: ${t.name} 與同階他件同為「${key}」`);
          seen.add(key);
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  it('魔導書分成攻擊型 INT、輔助型 SPI、敏捷型 AGI', () => {
    const bad: string[] = [];
    for (let tier = 4; tier <= 7; tier++) {
      const attrs = at('magicBook', tier)
        .map(t => Object.keys(t.bonusAttributes ?? {})[0] ?? '無').sort();
      if (JSON.stringify(attrs) !== JSON.stringify(['AGI', 'INT', 'SPI'])) {
        bad.push(`T${tier}: ${attrs.join('/')}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
