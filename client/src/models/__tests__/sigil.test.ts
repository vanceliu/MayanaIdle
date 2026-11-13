import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  AFFIX_POOLS,
  SHOP_MAX_AFFIX_TIER,
  getAffixTierTable,
  isSpecialAffixType,
  isTierlessAffixType,
  type Affix,
} from '../affix';
import { getItemById } from '../items';
import {
  CHAOS_SIGIL_MAX_TIER,
  CHAOS_SIGIL_BONUS_TIER,
  CHAOS_SIGIL_T6_RATE,
  CHAOS_SIGIL_T6_ANY_RATE,
  CHAOS_SIGIL_T6_MIN_LEVEL,
  MAX_SEALED_AFFIXES,
  SEAL_SIGIL_SUCCESS_RATE,
  ENHANCE_SIGIL_FAIL_TIER,
  ENHANCE_SIGIL_RATES,
  POLISH_SIGIL_GOLD_COST,
  POLISH_SIGIL_QUALITY_MAX,
  SIGIL_DEFINITIONS,
  STING_SPECIAL_REPLACEMENT_TIER,
  applyAddSigil,
  applyChaosSigil,
  applySealSigil,
  applyEnhanceSigil,
  applyPolishSigil,
  applyRecarveSigil,
  applyStingSigil,
  applyTemperSigil,
  canUseSigil,
  getEnhanceSigilRate,
  getSigilByItemId,
  getUpgradeSigilFor,
  isShopGear,
  type SigilContext,
} from '../sigil';

/** 讓 Math.random 依序回傳指定值（用完後固定回最後一個） */
function mockRandom(values: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[Math.min(i++, values.length - 1)]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** canUseSigil／精鍊／突破的最小 ctx。上衣／斗篷：FOUR 全在池內，且含特殊詞綴（§ 7.6、§ 7.10.1） */
const C = { category: 'shirtCloak' as const };
const W = { category: 'weapon' as const };

const dropCtx = (over: Partial<SigilContext> = {}): SigilContext => ({
  category: 'shirtCloak',
  charLevel: 60,
  weaponBaseDamage: 40,
  ...over,
});

/** 4 條都填滿的掉落品詞綴 */
const FOUR: Affix[] = [
  { type: 'defense', tier: 6, value: 15 },
  { type: 'max_hp', tier: 4, value: 55 },
  { type: 'drop_rate', tier: 2, value: 5 },
  { type: 'gold_rate', tier: 1, value: 3 },
];

const shopCtx = (over: Partial<SigilContext> = {}): SigilContext =>
  dropCtx({ maxAffixTier: SHOP_MAX_AFFIX_TIER, ...over });

describe('印記系統（§ 46）', () => {
  describe('定義與 seed 對應', () => {
    it('八種印記各有唯一的道具 id', () => {
      expect(SIGIL_DEFINITIONS).toHaveLength(8);
      const ids = SIGIL_DEFINITIONS.map(d => d.itemId);
      expect(new Set(ids).size).toBe(8);
      for (const itemId of ids) {
        expect(getSigilByItemId(itemId)?.itemId).toBe(itemId);
      }
    });

    it('商店裝以實例的 maxAffixTier 判定（§ 6A.6）', () => {
      expect(isShopGear(SHOP_MAX_AFFIX_TIER)).toBe(true);
      expect(isShopGear(undefined)).toBe(false);
    });
  });

  describe('混沌印記（§ 46.3）', () => {
    it('掉落品：4 條詞綴、Tier 落在 T1~T6、種類不重複', () => {
      for (let run = 0; run < 200; run++) {
        const { affixes } = applyChaosSigil(FOUR, dropCtx());
        expect(affixes).toHaveLength(FOUR.length);
        expect(new Set(affixes.map(a => a.type)).size).toBe(affixes.length);
        for (const a of affixes) {
          if (isTierlessAffixType(a.type)) continue;
          expect(a.tier).toBeGreaterThanOrEqual(1);
          expect(a.tier).toBeLessThanOrEqual(CHAOS_SIGIL_BONUS_TIER);
        }
      }
    });

    it('T6 機率：每條獨立，4 洞至少 1 條 T6 = 5%', () => {
      expect(CHAOS_SIGIL_BONUS_TIER).toBe(6);
      expect(CHAOS_SIGIL_T6_ANY_RATE).toBe(0.05);
      expect(1 - (1 - CHAOS_SIGIL_T6_RATE) ** 4).toBeCloseTo(0.05, 12);
      expect(CHAOS_SIGIL_T6_RATE).toBeCloseTo(0.012741, 6);
    });

    it('混沌／新增的說明文字與 T6 機率一致', () => {
      const pct = `${(CHAOS_SIGIL_T6_RATE * 100).toFixed(2)}% 為 T${CHAOS_SIGIL_BONUS_TIER}`;
      for (const type of ['chaos', 'add'] as const) {
        expect(SIGIL_DEFINITIONS.find(d => d.type === type)!.description).toContain(pct);
      }
      expect(getItemById(SIGIL_DEFINITIONS.find(d => d.type === 'chaos')!.itemId)!.description).toContain(pct);
    });

    /*
     * Tier 抽取把 [0, 1) 切成 T1~T5 各 (1 − p)/5、T6 佔最後的 p。
     * random 固定在 T6 區段起點的兩側，驗證切點就是 1 − p；兩個值都高於特殊詞綴機率，不會出特殊詞綴。
     */
    it.each([
      ['剛好低於 T6 區段：T5', 1 - CHAOS_SIGIL_T6_RATE - 1e-9, CHAOS_SIGIL_MAX_TIER],
      ['剛好進入 T6 區段：T6', 1 - CHAOS_SIGIL_T6_RATE + 1e-9, CHAOS_SIGIL_BONUS_TIER],
    ])('%s', (_label, roll, tier) => {
      mockRandom([roll]);
      const { affixes } = applyChaosSigil(FOUR, dropCtx());
      for (const a of affixes) {
        expect(isSpecialAffixType(a.type)).toBe(false);
        expect(a.tier).toBe(tier);
        const t = getAffixTierTable(a.type as never, 'shirtCloak')[tier - 1];
        expect(a.value).toBeGreaterThanOrEqual(t.min);
        expect(a.value).toBeLessThanOrEqual(t.max);
      }
    });

    it.each([
      [CHAOS_SIGIL_T6_MIN_LEVEL - 1, CHAOS_SIGIL_MAX_TIER],
      [CHAOS_SIGIL_T6_MIN_LEVEL, CHAOS_SIGIL_BONUS_TIER],
    ])('角色 Lv.%i：random 落在 T6 區段時為 T%i', (charLevel, tier) => {
      expect(CHAOS_SIGIL_T6_MIN_LEVEL).toBe(31);
      mockRandom([0.999999]);
      const { affixes } = applyChaosSigil(FOUR, dropCtx({ charLevel }));
      for (const a of affixes) expect(a.tier).toBe(tier);
    });

    it('商店裝：random 落在 T6 區段也只到 T3', () => {
      mockRandom([0.999999]);
      const { affixes } = applyChaosSigil(FOUR, shopCtx());
      for (const a of affixes) expect(a.tier).toBe(SHOP_MAX_AFFIX_TIER);
    });

    it('商店裝：Tier 不超過 T3，且完全不出特殊詞綴', () => {
      for (let run = 0; run < 300; run++) {
        const { affixes } = applyChaosSigil(FOUR, shopCtx());
        for (const a of affixes) {
          expect(isSpecialAffixType(a.type)).toBe(false);
          expect(a.tier).toBeLessThanOrEqual(SHOP_MAX_AFFIX_TIER);
        }
      }
    });

    it('角色 Lv.30 以下不會出特殊詞綴（門檻同 § 7.10.1）', () => {
      for (let run = 0; run < 300; run++) {
        const { affixes } = applyChaosSigil(FOUR, dropCtx({ charLevel: 30 }));
        expect(affixes.some(a => isSpecialAffixType(a.type))).toBe(false);
      }
    });

    it('角色 Lv.51+ 且機率判定命中時會出特殊詞綴', () => {
      mockRandom([0]); // 特殊詞綴判定必中，且一律取池中第一個
      const { affixes } = applyChaosSigil(FOUR, dropCtx({ charLevel: 60 }));
      expect(affixes.some(a => isSpecialAffixType(a.type))).toBe(true);
    });

    it('武器裝備重骰後不會出現防具詞綴', () => {
      const weaponTypes = new Set(
        Object.keys(AFFIX_POOLS.weapon),
      );
      const { affixes } = applyChaosSigil(
        [{ type: 'attack_power', tier: 3, value: 10 }, { type: 'crit_rate', tier: 3, value: 10 }],
        dropCtx({ category: 'weapon' }),
      );
      for (const a of affixes) expect(weaponTypes.has(a.type as never)).toBe(true);
    });
  });

  describe('刺針印記（§ 46.4）', () => {
    const base: Affix[] = [
      { type: 'defense', tier: 6, value: 17 },
      { type: 'max_hp', tier: 4, value: 12 },
    ];

    it('Tier 不變、種類換掉、且不與同件其他詞綴重複', () => {
      for (let run = 0; run < 200; run++) {
        const { affixes } = applyStingSigil(base, 0, dropCtx({ charLevel: 30 }));
        const next = affixes[0];
        expect(next.type).not.toBe('defense');
        expect(next.type).not.toBe('max_hp');
        // 換成無 Tier 的那兩類（特殊詞綴、額外屬性）時原本的 Tier 直接作廢
        expect(next.tier).toBe(isTierlessAffixType(next.type) ? 0 : 6);
        expect(affixes[1]).toEqual(base[1]);
      }
    });

    it('原本是特殊詞綴時，換出來的一般詞綴固定 T5', () => {
      const withSpecial: Affix[] = [{ type: 'immune_poison', tier: 0, value: 0 }, base[1]];
      let checked = 0;
      for (let run = 0; run < 200; run++) {
        // charLevel 30：特殊詞綴池為空，必定換成一般詞綴
        const { affixes } = applyStingSigil(withSpecial, 0, dropCtx({ charLevel: 30 }));
        expect(isSpecialAffixType(affixes[0].type)).toBe(false);
        // 額外屬性同樣無 Tier，沒有 Tier 可繼承這件事對它不適用
        if (isTierlessAffixType(affixes[0].type)) continue;
        checked++;
        expect(affixes[0].tier).toBe(STING_SPECIAL_REPLACEMENT_TIER);
        const table = getAffixTierTable(affixes[0].type as never, 'shirtCloak');
        const t5 = table.find(t => t.tier === STING_SPECIAL_REPLACEMENT_TIER)!;
        expect(affixes[0].value).toBeGreaterThanOrEqual(t5.min);
        expect(affixes[0].value).toBeLessThanOrEqual(t5.max);
      }
      expect(checked).toBeGreaterThan(0);
    });

    it('骰到特殊詞綴時維持無 Tier（§ 7.10.2）', () => {
      mockRandom([0.999]); // 取合併池的最後一個 —— 特殊詞綴排在一般詞綴之後
      const { affixes } = applyStingSigil(base, 0, dropCtx({ charLevel: 60 }));
      expect(isSpecialAffixType(affixes[0].type)).toBe(true);
      expect(affixes[0].tier).toBe(0);
    });

    it('商店裝的池不含特殊詞綴', () => {
      for (let run = 0; run < 300; run++) {
        const { affixes } = applyStingSigil(base, 0, shopCtx());
        expect(isSpecialAffixType(affixes[0].type)).toBe(false);
      }
    });

    it('元素侵蝕換上來時會帶元素與每跳傷害', () => {
      const weaponBase: Affix[] = [{ type: 'attack_power', tier: 5, value: 15 }];
      let found = false;
      for (let run = 0; run < 300 && !found; run++) {
        const { affixes } = applyStingSigil(weaponBase, 0, dropCtx({ category: 'weapon' }));
        if (affixes[0].type !== 'element_erosion') continue;
        found = true;
        expect(affixes[0].element).toBeTruthy();
        expect(affixes[0].dotDamage).toBeGreaterThan(0);
      }
      expect(found).toBe(true);
    });
  });

  describe('重刻印記（§ 46.5）', () => {
    it('種類與 Tier 不變，只有數值重骰', () => {
      const affixes: Affix[] = [{ type: 'defense', tier: 6, value: 16 }];
      const { affixes: next } = applyRecarveSigil(affixes, 0, dropCtx());
      expect(next[0].type).toBe('defense');
      expect(next[0].tier).toBe(6);
      const t6 = getAffixTierTable('defense', 'shirtCloak').find(t => t.tier === 6)!;
      expect(next[0].value).toBeGreaterThanOrEqual(t6.min);
      expect(next[0].value).toBeLessThanOrEqual(t6.max);
    });

    it('元素侵蝕：觸發率與每跳傷害都重骰，元素不變', () => {
      const affixes: Affix[] = [
        { type: 'element_erosion', tier: 5, value: 14, element: 'fire', dotDamage: 3 },
      ];
      const { affixes: next } = applyRecarveSigil(affixes, 0, dropCtx({
        category: 'weapon', weaponBaseDamage: 80,
      }));
      expect(next[0].element).toBe('fire');
      expect(next[0].dotDamage).toBeGreaterThanOrEqual(40);
      expect(next[0].dotDamage).toBeLessThanOrEqual(80);
    });

    it('受擊回血：只重骰觸發率，不另外帶回復比例（隨觸發率，07-affix § 7.9）', () => {
      const affixes: Affix[] = [{ type: 'on_hit_hp', tier: 5, value: 5 }];
      for (let run = 0; run < 100; run++) {
        const { affixes: next } = applyRecarveSigil(affixes, 0, dropCtx({ category: 'helmChest' }));
        expect('restorePercent' in next[0]).toBe(false);
        expect(next[0].value).toBeGreaterThanOrEqual(4.5);
        expect(next[0].value).toBeLessThanOrEqual(5.3);
      }
    });

    it('特殊詞綴沒有數值，不受理', () => {
      const affixes: Affix[] = [{ type: 'immune_bleed', tier: 0, value: 0 }];
      expect(canUseSigil('recarve', affixes, 0, C).ok).toBe(false);
    });
  });

  // § 46.2：精鍊與突破**不可合併**，介面上是六個各自獨立的印記
  describe('印記清單（§ 46.2）', () => {
    it('八種印記各自獨立，精鍊與突破不合併', () => {
      expect(SIGIL_DEFINITIONS.map(d => d.type))
        .toEqual(['chaos', 'sting', 'recarve', 'temper', 'enhance', 'polish', 'add', 'seal']);
    });

    it('每種印記都對得到一個道具 id，名稱與 seed 一致（§ 99.1 存 id 不存名稱）', () => {
      for (const d of SIGIL_DEFINITIONS) {
        expect(getItemById(d.itemId)?.name, d.type).toBe(d.name);
      }
    });
  });

  describe('精鍊印記（§ 46.6）', () => {
    it('取得管道上限以內走精鍊，上限以上交給突破', () => {
      const t3: Affix = { type: 'defense', tier: 3, value: 11 };
      const t5: Affix = { type: 'defense', tier: 5, value: 15 };
      // 掉落／製作品：上限 T5
      expect(getUpgradeSigilFor(t3)).toEqual({ type: 'temper', rate: 1 });
      expect(getUpgradeSigilFor(t5)).toEqual({ type: 'enhance', rate: 0.10 });
      // 商店裝：上限 T3，T3 之後就沒有精鍊可用，且 T3 也不在突破的守備範圍
      expect(getUpgradeSigilFor({ type: 'defense', tier: 2, value: 8 }, SHOP_MAX_AFFIX_TIER))
        .toEqual({ type: 'temper', rate: 1 });
      expect(getUpgradeSigilFor(t3, SHOP_MAX_AFFIX_TIER)).toBeUndefined();
    });

    it('Tier +1 必定成功，數值以新 Tier 的區間重骰', () => {
      mockRandom([0.99]);
      const { affixes, success } = applyTemperSigil([{ type: 'defense', tier: 3, value: 9 }], 0, C);
      expect(success).toBe(true);
      expect(affixes[0].tier).toBe(4);
      const t4 = getAffixTierTable('defense', 'shirtCloak').find(t => t.tier === 4)!;
      expect(affixes[0].value).toBeGreaterThanOrEqual(t4.min);
      expect(affixes[0].value).toBeLessThanOrEqual(t4.max);
    });

    it('推到取得管道上限後不再受理', () => {
      const t5: Affix[] = [{ type: 'defense', tier: 5, value: 15 }];
      expect(applyTemperSigil(t5, 0, C).success).toBe(false);
      expect(canUseSigil('temper', t5, 0, C).ok).toBe(false);
      // 商店裝 T3 就是頂
      const t3: Affix[] = [{ type: 'defense', tier: 3, value: 11 }];
      expect(canUseSigil('temper', t3, 0, { ...C, maxAffixTier: SHOP_MAX_AFFIX_TIER }).ok).toBe(false);
      expect(canUseSigil('temper', t3, 0, C).ok).toBe(true);
    });

    it('元素與每跳傷害不動', () => {
      mockRandom([0.5]);
      const { affixes } = applyTemperSigil(
        [{ type: 'element_erosion', tier: 2, value: 7, element: 'fire', dotDamage: 21 }], 0, W,
      );
      expect(affixes[0].dotDamage).toBe(21);
      expect(affixes[0].element).toBe('fire');
    });

    it('特殊詞綴無 Tier，不受理', () => {
      const special: Affix[] = [{ type: 'immune_poison', tier: 0, value: 0 }];
      expect(canUseSigil('temper', special, 0, C).ok).toBe(false);
      expect(applyTemperSigil(special, 0, C).success).toBe(false);
    });
  });

  describe('工藝印記（§ 46.8）', () => {
    it('品質 +1%，上限 20%', () => {
      expect(applyPolishSigil(0)).toMatchObject({ quality: 1, success: true });
      expect(applyPolishSigil(19)).toMatchObject({ quality: 20, success: true });
      expect(applyPolishSigil(POLISH_SIGIL_QUALITY_MAX).success).toBe(false);
    });

    it('唯一收金幣的印記，金額同 `08-quality.md` § 8.3', () => {
      expect(POLISH_SIGIL_GOLD_COST).toBe(5000);
    });

    it('品質已滿或裝備無詞綴時不受理', () => {
      const affixes: Affix[] = [{ type: 'defense', tier: 3, value: 11 }];
      expect(canUseSigil('polish', affixes, undefined, { ...C, quality: 0 }).ok).toBe(true);
      expect(canUseSigil('polish', affixes, undefined, { ...C, quality: POLISH_SIGIL_QUALITY_MAX }).ok).toBe(false);
      expect(canUseSigil('polish', [], undefined, { ...C, quality: 0 }).ok).toBe(false);
    });
  });

  describe('突破印記（§ 46.7）', () => {
    it('只受理 T5 與 T6', () => {
      expect(getEnhanceSigilRate(5)).toBe(0.10);
      expect(getEnhanceSigilRate(6)).toBe(0.02);
      expect(getEnhanceSigilRate(4)).toBeUndefined();
      expect(ENHANCE_SIGIL_RATES).toHaveLength(2);

      const t4: Affix[] = [{ type: 'defense', tier: 4, value: 12 }];
      const t7: Affix[] = [{ type: 'defense', tier: 7, value: 20 }];
      expect(canUseSigil('enhance', t4, 0, C).ok).toBe(false);
      expect(canUseSigil('enhance', t7, 0, C).ok).toBe(false);
      expect(canUseSigil('enhance', [{ type: 'defense', tier: 5, value: 15 }], 0, C).ok).toBe(true);
    });

    it('T5 → T6：擲點低於 10% 時成功', () => {
      mockRandom([0.05, 0.5]);
      const { affixes, success } = applyEnhanceSigil([{ type: 'defense', tier: 5, value: 15 }], 0, C);
      expect(success).toBe(true);
      expect(affixes[0].tier).toBe(6);
    });

    it('T6 → T7：擲點低於 2% 時成功', () => {
      mockRandom([0.01, 0.5]);
      const { affixes, success } = applyEnhanceSigil([{ type: 'defense', tier: 6, value: 17 }], 0, C);
      expect(success).toBe(true);
      expect(affixes[0].tier).toBe(7);
    });

    it('失敗時掉回 T1，數值以 T1 區間重骰', () => {
      mockRandom([0.9, 0.5]);
      const { affixes, success } = applyEnhanceSigil([{ type: 'defense', tier: 6, value: 18 }], 0, C);
      expect(success).toBe(false);
      expect(affixes[0].tier).toBe(ENHANCE_SIGIL_FAIL_TIER);
      const t1 = getAffixTierTable('defense', 'shirtCloak').find(t => t.tier === ENHANCE_SIGIL_FAIL_TIER)!;
      expect(affixes[0].value).toBeGreaterThanOrEqual(t1.min);
      expect(affixes[0].value).toBeLessThanOrEqual(t1.max);
    });

    it('每跳傷害與回復比例不隨 Tier 變動', () => {
      mockRandom([0.9, 0.5]);
      const affixes: Affix[] = [
        { type: 'element_erosion', tier: 5, value: 14, element: 'ice', dotDamage: 33 },
      ];
      const { affixes: next } = applyEnhanceSigil(affixes, 0, W);
      expect(next[0].dotDamage).toBe(33);
      expect(next[0].element).toBe('ice');
    });

    it('特殊詞綴無 Tier，不受理', () => {
      const affixes: Affix[] = [{ type: 'resist_stun', tier: 0, value: 0 }];
      expect(canUseSigil('enhance', affixes, 0, C).ok).toBe(false);
    });
  });

  describe('共通限制（§ 46.9）', () => {
    const affixes: Affix[] = [{ type: 'defense', tier: 5, value: 15 }];

    it('新手裝一律不可使用', () => {
      for (const sigil of SIGIL_DEFINITIONS) {
        expect(canUseSigil(sigil.type, affixes, 0, { ...C, isStarterGear: true }).ok).toBe(false);
      }
    });

    it('沒有詞綴時，刺針／重刻／精鍊／突破／工藝／封印不受理，新增與混沌可用', () => {
      expect(canUseSigil('sting', [], undefined, C).ok).toBe(false);
      expect(canUseSigil('recarve', undefined, undefined, C).ok).toBe(false);
      expect(canUseSigil('temper', [], 0, C).ok).toBe(false);
      expect(canUseSigil('enhance', [], 0, C).ok).toBe(false);
      expect(canUseSigil('polish', [], undefined, C).ok).toBe(false);
      expect(canUseSigil('chaos', [], undefined, C).ok).toBe(true);
      expect(canUseSigil('seal', [], 0, C).ok).toBe(false);
      expect(canUseSigil('add', [], undefined, C).ok).toBe(true);
    });

    it('刺針可以把特殊詞綴換掉', () => {
      const special: Affix[] = [{ type: 'immune_poison', tier: 0, value: 0 }];
      expect(canUseSigil('sting', special, 0, C).ok).toBe(true);
    });
  });

  describe('混沌印記與詞綴洞（§ 46.3）', () => {
    it('不看既有條數，一律抽滿 4 洞；毀壞的洞不算', () => {
      for (let run = 0; run < 100; run++) {
        expect(applyChaosSigil(FOUR.slice(0, 1), dropCtx()).affixes).toHaveLength(4);
        expect(applyChaosSigil([], dropCtx()).affixes).toHaveLength(4);
        expect(applyChaosSigil(FOUR.slice(0, 1), dropCtx({ affixSlots: 3 })).affixes).toHaveLength(3);
      }
    });

    it('封印詞綴不佔洞：4 洞全部抽滿，封印詞綴原樣留在最後、種類不重複', () => {
      const sealed: Affix = { type: 'max_hp', tier: 4, value: 55, sealed: true };
      const base = [FOUR[0], FOUR[2], FOUR[3], sealed];
      for (let run = 0; run < 200; run++) {
        const { affixes } = applyChaosSigil(base, dropCtx());
        expect(affixes).toHaveLength(5);
        expect(affixes[4]).toBe(sealed);
        expect(affixes.filter(a => a.type === 'max_hp')).toHaveLength(1);
      }
    });

    it('沒有任何洞時不受理；沒有詞綴但有洞照常受理', () => {
      const only: Affix[] = [{ type: 'defense', tier: 1, value: 3, sealed: true }];
      expect(canUseSigil('chaos', only, undefined, { ...C, affixSlots: 1 }).ok).toBe(true);
      expect(canUseSigil('chaos', only, undefined, { ...C, affixSlots: 0 }).ok).toBe(false);
      expect(canUseSigil('chaos', [], undefined, C).ok).toBe(true);
      expect(canUseSigil('chaos', [], undefined, { ...C, affixSlots: 0 }).ok).toBe(false);
    });
  });

  describe('新增印記（§ 46.11）', () => {
    it('有空洞才受理；被毀壞的洞不算；封印詞綴不佔洞', () => {
      const sealedLast: Affix[] = [...FOUR, { type: 'heal_effect', tier: 1, value: 3, sealed: true }];
      expect(canUseSigil('add', sealedLast, undefined, C).ok).toBe(false);
      expect(canUseSigil('add', sealedLast.slice(1), undefined, C).ok).toBe(true);
      expect(canUseSigil('add', FOUR.slice(0, 3), undefined, C).ok).toBe(true);
      expect(canUseSigil('add', [], undefined, C).ok).toBe(true);
      expect(canUseSigil('add', FOUR, undefined, C).ok).toBe(false);
      expect(canUseSigil('add', FOUR.slice(0, 3), undefined, { ...C, affixSlots: 3 }).ok).toBe(false);
    });

    it('新增一條、種類不重複、Tier T1~T6', () => {
      for (let run = 0; run < 300; run++) {
        const { affixes, success } = applyAddSigil(FOUR.slice(0, 3), dropCtx());
        expect(success).toBe(true);
        expect(affixes).toHaveLength(4);
        expect(new Set(affixes.map(a => a.type)).size).toBe(4);
        const added = affixes[3];
        if (!isTierlessAffixType(added.type)) expect(added.tier).toBeLessThanOrEqual(CHAOS_SIGIL_BONUS_TIER);
      }
    });

    it.each([
      ['剛好低於 T6 區段：T5', 1 - CHAOS_SIGIL_T6_RATE - 1e-9, CHAOS_SIGIL_MAX_TIER],
      ['剛好進入 T6 區段：T6', 1 - CHAOS_SIGIL_T6_RATE + 1e-9, CHAOS_SIGIL_BONUS_TIER],
    ])('T6 切點同混沌：%s', (_label, roll, tier) => {
      mockRandom([roll]);
      const added = applyAddSigil(FOUR.slice(0, 3), dropCtx()).affixes[3];
      expect(added.tier).toBe(tier);
    });

    it('角色 Lv.30 以下不出 T6', () => {
      mockRandom([0.999999]);
      const added = applyAddSigil(FOUR.slice(0, 3), dropCtx({ charLevel: CHAOS_SIGIL_T6_MIN_LEVEL - 1 })).affixes[3];
      expect(added.tier).toBe(CHAOS_SIGIL_MAX_TIER);
    });

    it('商店裝 T3 上限且不出特殊詞綴', () => {
      for (let run = 0; run < 300; run++) {
        const added = applyAddSigil(FOUR.slice(0, 3), shopCtx()).affixes[3];
        expect(isSpecialAffixType(added.type)).toBe(false);
        expect(added.tier).toBeLessThanOrEqual(SHOP_MAX_AFFIX_TIER);
      }
    });

    it('不與封印詞綴重複，新的一條排在封印詞綴之前', () => {
      const sealed: Affix = { type: 'defense', tier: 1, value: 3, sealed: true };
      for (let run = 0; run < 200; run++) {
        const { affixes } = applyAddSigil([FOUR[1], sealed], dropCtx());
        expect(affixes).toHaveLength(3);
        expect(affixes[1].type).not.toBe('defense');
        expect(affixes[2]).toBe(sealed);
      }
    });

    it('新手裝不受理', () => {
      expect(canUseSigil('add', [], undefined, { ...C, isStarterGear: true }).ok).toBe(false);
    });
  });

  describe('封印印記（§ 46.12）', () => {
    it(`成功率 ${SEAL_SIGIL_SUCCESS_RATE * 100}%：成功移出詞綴洞排到最後，原本的洞空出來`, () => {
      mockRandom([SEAL_SIGIL_SUCCESS_RATE - 0.001]);
      const r = applySealSigil(FOUR, 1, {});
      expect(r.success).toBe(true);
      expect(r.affixes).toEqual([FOUR[0], FOUR[2], FOUR[3], { ...FOUR[1], sealed: true }]);
      expect(r.affixSlots).toBeUndefined();
      // 空出來的洞可以用新增印記補
      expect(canUseSigil('add', r.affixes, undefined, C).ok).toBe(true);
    });

    it('失敗：該詞綴與洞一起毀壞（4 條變 3 條、洞 4→3）', () => {
      mockRandom([SEAL_SIGIL_SUCCESS_RATE]);
      const r = applySealSigil(FOUR, 1, {});
      expect(r.success).toBe(false);
      expect(r.affixes).toEqual([FOUR[0], FOUR[2], FOUR[3]]);
      expect(r.affixSlots).toBe(3);
      mockRandom([0.99]);
      expect(applySealSigil(FOUR.slice(0, 2), 0, { affixSlots: 2 }).affixSlots).toBe(1);
    });

    it(`一件最多封 ${MAX_SEALED_AFFIXES} 條；已封印的不受理`, () => {
      const one: Affix[] = [{ ...FOUR[0], sealed: true }, FOUR[1]];
      expect(canUseSigil('seal', one, 1, C).ok).toBe(false);
      expect(canUseSigil('seal', one, 0, C).ok).toBe(false);
      expect(canUseSigil('seal', FOUR, 0, C).ok).toBe(true);
    });

    it('特殊詞綴與額外屬性也可封印', () => {
      const list: Affix[] = [
        { type: 'immune_poison', tier: 0, value: 0 },
        { type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' },
      ];
      expect(canUseSigil('seal', list, 0, C).ok).toBe(true);
      expect(canUseSigil('seal', list, 1, C).ok).toBe(true);
    });

    it('封印詞綴：刺針／重刻／精鍊／突破都不受理', () => {
      const list: Affix[] = [{ type: 'defense', tier: 5, value: 12, sealed: true }];
      for (const type of ['sting', 'recarve', 'temper', 'enhance'] as const) {
        const check = canUseSigil(type, list, 0, C);
        expect(check.ok, type).toBe(false);
        expect(check.reason).toBe('封印詞綴無法變更');
      }
      expect(canUseSigil('polish', list, undefined, { ...C, quality: 0 }).ok).toBe(true);
    });
  });

  describe('舊詞綴（`07-affix.md` § 7.11.2）', () => {
    // 武器上的爆擊率、手套上的防禦力：不在所屬分類池內
    const weaponLegacy: Affix[] = [{ type: 'crit_rate', tier: 3, value: 9 }, { type: 'attack_power', tier: 3, value: 8 }];
    const glovesLegacy: Affix[] = [{ type: 'defense', tier: 5, value: 2.3 }];

    it('精鍊／突破／重刻不受理，原因寫出分類', () => {
      for (const type of ['temper', 'recarve'] as const) {
        const check = canUseSigil(type, weaponLegacy, 0, W);
        expect(check.ok, type).toBe(false);
        expect(check.reason).toBe('已不在武器的詞綴池，只能用刺針或混沌換掉');
      }
      const enhance = canUseSigil('enhance', glovesLegacy, 0, { category: 'gloves' });
      expect(enhance.ok).toBe(false);
      expect(enhance.reason).toBe('已不在手套的詞綴池，只能用刺針或混沌換掉');
    });

    it('同件池內的詞綴照常受理', () => {
      expect(canUseSigil('temper', weaponLegacy, 1, W).ok).toBe(true);
      expect(canUseSigil('recarve', weaponLegacy, 1, W).ok).toBe(true);
    });

    it('刺針與混沌照常受理，換出來的是池內詞綴', () => {
      expect(canUseSigil('sting', weaponLegacy, 0, W).ok).toBe(true);
      expect(canUseSigil('chaos', weaponLegacy, undefined, W).ok).toBe(true);
      for (let run = 0; run < 100; run++) {
        const stung = applyStingSigil(weaponLegacy, 0, dropCtx({ category: 'weapon' })).affixes[0];
        expect(stung.type in AFFIX_POOLS.weapon, stung.type).toBe(true);
        expect(stung.tier).toBe(3);
        for (const a of applyChaosSigil(weaponLegacy, dropCtx({ category: 'weapon' })).affixes) {
          expect(a.type in AFFIX_POOLS.weapon, a.type).toBe(true);
        }
      }
    });

    it('池內的舊數值升階後走新表（升階跳新表數值）', () => {
      // 胸甲防禦力 P1：T5 = 4.1~5.0
      const { affixes } = applyTemperSigil([{ type: 'defense', tier: 4, value: 1.8 }], 0, { category: 'helmChest' });
      expect(affixes[0].tier).toBe(5);
      expect(affixes[0].value).toBeGreaterThanOrEqual(4.1);
      expect(affixes[0].value).toBeLessThanOrEqual(5);
    });
  });

  describe('數值依所屬分類的階級表', () => {
    it('刺針換成爆擊率：手套走 P2、項鍊走 P1（Tier 不變）', () => {
      const base: Affix[] = [{ type: 'max_hp', tier: 4, value: 55 }];
      for (const [category, lo, hi] of [['gloves', 6.1, 8], ['necklace', 3.1, 4]] as const) {
        let seen = 0;
        for (let run = 0; run < 300; run++) {
          const next = applyStingSigil(base, 0, dropCtx({ category, charLevel: 30 })).affixes[0];
          if (next.type !== 'crit_rate') continue;
          seen++;
          expect(next.value).toBeGreaterThanOrEqual(lo);
          expect(next.value).toBeLessThanOrEqual(hi);
        }
        expect(seen, category).toBeGreaterThan(0);
      }
    });

    it('混沌／新增只抽所屬分類的池', () => {
      for (const category of Object.keys(AFFIX_POOLS) as (keyof typeof AFFIX_POOLS)[]) {
        for (let run = 0; run < 30; run++) {
          for (const a of applyChaosSigil([], dropCtx({ category, charLevel: 30 })).affixes) {
            expect(a.type in AFFIX_POOLS[category], `${category} ${a.type}`).toBe(true);
          }
        }
      }
    });

    it('特殊詞綴只會在上衣／斗篷、腰帶被抽到', () => {
      for (const category of Object.keys(AFFIX_POOLS) as (keyof typeof AFFIX_POOLS)[]) {
        let special = false;
        for (let run = 0; run < 200; run++) {
          mockRandom([0]);
          special ||= applyChaosSigil([], dropCtx({ category, charLevel: 60 })).affixes.some(a => isSpecialAffixType(a.type));
          vi.restoreAllMocks();
        }
        expect(special, category).toBe(category === 'shirtCloak' || category === 'belt');
      }
    });
  });
});

describe('舊詞綴：apply 端同樣不受理精鍊／突破／重刻（`07-affix.md` § 7.11.2）', () => {
  it('武器上的爆擊率原樣保留並回傳原因', async () => {
    const { applyTemperSigil, applyEnhanceSigil, applyRecarveSigil, legacyAffixReason } = await import('../sigil');
    const ctx = { category: 'weapon' as const, charLevel: 50 };
    const t3 = [{ type: 'crit_rate' as const, tier: 3, value: 9 }];
    const t5 = [{ type: 'crit_rate' as const, tier: 5, value: 14 }];
    for (const r of [applyTemperSigil(t3, 0, ctx), applyRecarveSigil(t3, 0, ctx), applyEnhanceSigil(t5, 0, ctx)]) {
      expect(r.success).toBe(false);
      expect(r.message).toBe(legacyAffixReason('weapon'));
    }
    expect(applyTemperSigil(t3, 0, ctx).affixes).toBe(t3);
  });
});
