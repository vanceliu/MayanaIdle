import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  AFFIX_DEFINITIONS,
  SHOP_MAX_AFFIX_TIER,
  getAffixTierTable,
  isSpecialAffixType,
  type Affix,
} from '../affix';
import {
  CHAOS_SIGIL_MAX_TIER,
  CHAOS_SIGIL_SLOTS,
  ENHANCE_SIGIL_FAIL_TIER,
  ENHANCE_SIGIL_RATES,
  POLISH_SIGIL_GOLD_COST,
  POLISH_SIGIL_QUALITY_MAX,
  SIGIL_DEFINITIONS,
  SIGIL_TABS,
  STING_SPECIAL_REPLACEMENT_TIER,
  applyChaosSigil,
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

const dropCtx = (over: Partial<SigilContext> = {}): SigilContext => ({
  category: 'armor',
  charLevel: 60,
  weaponBaseDamage: 40,
  ...over,
});

const shopCtx = (over: Partial<SigilContext> = {}): SigilContext =>
  dropCtx({ maxAffixTier: SHOP_MAX_AFFIX_TIER, ...over });

describe('印記系統（§ 46）', () => {
  describe('定義與 seed 對應', () => {
    it('六種印記各有唯一的道具 id', () => {
      expect(SIGIL_DEFINITIONS).toHaveLength(6);
      const ids = SIGIL_DEFINITIONS.map(d => d.itemId);
      expect(new Set(ids).size).toBe(6);
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
    it('掉落／製作品：4 條詞綴、Tier 落在 T1~T5、種類不重複', () => {
      for (let run = 0; run < 200; run++) {
        const { affixes } = applyChaosSigil(dropCtx());
        expect(affixes).toHaveLength(CHAOS_SIGIL_SLOTS);
        expect(new Set(affixes.map(a => a.type)).size).toBe(affixes.length);
        for (const a of affixes) {
          if (isSpecialAffixType(a.type)) continue;
          expect(a.tier).toBeGreaterThanOrEqual(1);
          expect(a.tier).toBeLessThanOrEqual(CHAOS_SIGIL_MAX_TIER);
        }
      }
    });

    it('商店裝：Tier 不超過 T3，且完全不出特殊詞綴', () => {
      for (let run = 0; run < 300; run++) {
        const { affixes } = applyChaosSigil(shopCtx());
        for (const a of affixes) {
          expect(isSpecialAffixType(a.type)).toBe(false);
          expect(a.tier).toBeLessThanOrEqual(SHOP_MAX_AFFIX_TIER);
        }
      }
    });

    it('角色 Lv.30 以下不會出特殊詞綴（門檻同 § 7.10.1）', () => {
      for (let run = 0; run < 300; run++) {
        const { affixes } = applyChaosSigil(dropCtx({ charLevel: 30 }));
        expect(affixes.some(a => isSpecialAffixType(a.type))).toBe(false);
      }
    });

    it('角色 Lv.51+ 且機率判定命中時會出特殊詞綴', () => {
      mockRandom([0]); // 特殊詞綴判定必中，且一律取池中第一個
      const { affixes } = applyChaosSigil(dropCtx({ charLevel: 60 }));
      expect(affixes.some(a => isSpecialAffixType(a.type))).toBe(true);
    });

    it('武器裝備重骰後不會出現防具詞綴', () => {
      const weaponTypes = new Set(
        AFFIX_DEFINITIONS.filter(d => d.category.includes('weapon')).map(d => d.type),
      );
      const { affixes } = applyChaosSigil(dropCtx({ category: 'weapon' }));
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
        expect(next.tier).toBe(6);
        expect(affixes[1]).toEqual(base[1]);
      }
    });

    it('原本是特殊詞綴時，換出來的一般詞綴固定 T5', () => {
      const withSpecial: Affix[] = [{ type: 'immune_poison', tier: 0, value: 0 }, base[1]];
      // charLevel 30：特殊詞綴池為空，必定換成一般詞綴
      const { affixes } = applyStingSigil(withSpecial, 0, dropCtx({ charLevel: 30 }));
      expect(isSpecialAffixType(affixes[0].type)).toBe(false);
      expect(affixes[0].tier).toBe(STING_SPECIAL_REPLACEMENT_TIER);
      const table = getAffixTierTable(affixes[0].type as never);
      const t5 = table.find(t => t.tier === STING_SPECIAL_REPLACEMENT_TIER)!;
      expect(affixes[0].value).toBeGreaterThanOrEqual(t5.min);
      expect(affixes[0].value).toBeLessThanOrEqual(t5.max);
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
      const t6 = getAffixTierTable('defense').find(t => t.tier === 6)!;
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

    it('受擊回血：回復比例重骰在 2~4%', () => {
      const affixes: Affix[] = [{ type: 'on_hit_hp', tier: 5, value: 14, restorePercent: 2 }];
      for (let run = 0; run < 100; run++) {
        const { affixes: next } = applyRecarveSigil(affixes, 0, dropCtx());
        expect(next[0].restorePercent).toBeGreaterThanOrEqual(2);
        expect(next[0].restorePercent).toBeLessThanOrEqual(4);
      }
    });

    it('特殊詞綴沒有數值，不受理', () => {
      const affixes: Affix[] = [{ type: 'immune_bleed', tier: 0, value: 0 }];
      expect(canUseSigil('recarve', affixes, 0, {}).ok).toBe(false);
    });
  });

  // § 46.2：精鍊與突破合用一個分頁，故分頁數比印記種類少一個
  describe('分頁（§ 46.2）', () => {
    it('精鍊與突破共用升階分頁，其餘各自一個分頁', () => {
      expect(SIGIL_TABS.map(t => t.tab)).toEqual(['chaos', 'sting', 'recarve', 'enhance', 'polish']);
      const upgradeTab = SIGIL_DEFINITIONS.filter(d => d.tab === 'enhance').map(d => d.type);
      expect(upgradeTab).toEqual(['temper', 'enhance']);
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
      const { affixes, success } = applyTemperSigil([{ type: 'defense', tier: 3, value: 9 }], 0, {});
      expect(success).toBe(true);
      expect(affixes[0].tier).toBe(4);
      const t4 = getAffixTierTable('defense').find(t => t.tier === 4)!;
      expect(affixes[0].value).toBeGreaterThanOrEqual(t4.min);
      expect(affixes[0].value).toBeLessThanOrEqual(t4.max);
    });

    it('推到取得管道上限後不再受理', () => {
      const t5: Affix[] = [{ type: 'defense', tier: 5, value: 15 }];
      expect(applyTemperSigil(t5, 0, {}).success).toBe(false);
      expect(canUseSigil('temper', t5, 0, {}).ok).toBe(false);
      // 商店裝 T3 就是頂
      const t3: Affix[] = [{ type: 'defense', tier: 3, value: 11 }];
      expect(canUseSigil('temper', t3, 0, { maxAffixTier: SHOP_MAX_AFFIX_TIER }).ok).toBe(false);
      expect(canUseSigil('temper', t3, 0, {}).ok).toBe(true);
    });

    it('元素與每跳傷害不動', () => {
      mockRandom([0.5]);
      const { affixes } = applyTemperSigil(
        [{ type: 'element_erosion', tier: 2, value: 7, element: 'fire', dotDamage: 21 }], 0, {},
      );
      expect(affixes[0].dotDamage).toBe(21);
      expect(affixes[0].element).toBe('fire');
    });

    it('特殊詞綴無 Tier，不受理', () => {
      const special: Affix[] = [{ type: 'immune_poison', tier: 0, value: 0 }];
      expect(canUseSigil('temper', special, 0, {}).ok).toBe(false);
      expect(applyTemperSigil(special, 0, {}).success).toBe(false);
    });
  });

  describe('工藝印記（§ 46.8）', () => {
    it('品質 +1%，上限 20%', () => {
      expect(applyPolishSigil(0)).toMatchObject({ quality: 1, success: true });
      expect(applyPolishSigil(19)).toMatchObject({ quality: 20, success: true });
      expect(applyPolishSigil(POLISH_SIGIL_QUALITY_MAX).success).toBe(false);
    });

    it('唯一收金幣的印記，金額同 `08-quality.md` § 8.3', () => {
      expect(POLISH_SIGIL_GOLD_COST).toBe(50000);
    });

    it('品質已滿或裝備無詞綴時不受理', () => {
      const affixes: Affix[] = [{ type: 'defense', tier: 3, value: 11 }];
      expect(canUseSigil('polish', affixes, undefined, { quality: 0 }).ok).toBe(true);
      expect(canUseSigil('polish', affixes, undefined, { quality: POLISH_SIGIL_QUALITY_MAX }).ok).toBe(false);
      expect(canUseSigil('polish', [], undefined, { quality: 0 }).ok).toBe(false);
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
      expect(canUseSigil('enhance', t4, 0, {}).ok).toBe(false);
      expect(canUseSigil('enhance', t7, 0, {}).ok).toBe(false);
      expect(canUseSigil('enhance', [{ type: 'defense', tier: 5, value: 15 }], 0, {}).ok).toBe(true);
    });

    it('T5 → T6：擲點低於 10% 時成功', () => {
      mockRandom([0.05, 0.5]);
      const { affixes, success } = applyEnhanceSigil([{ type: 'defense', tier: 5, value: 15 }], 0);
      expect(success).toBe(true);
      expect(affixes[0].tier).toBe(6);
    });

    it('T6 → T7：擲點低於 2% 時成功', () => {
      mockRandom([0.01, 0.5]);
      const { affixes, success } = applyEnhanceSigil([{ type: 'defense', tier: 6, value: 17 }], 0);
      expect(success).toBe(true);
      expect(affixes[0].tier).toBe(7);
    });

    it('失敗時掉回 T1，數值以 T1 區間重骰', () => {
      mockRandom([0.9, 0.5]);
      const { affixes, success } = applyEnhanceSigil([{ type: 'defense', tier: 6, value: 18 }], 0);
      expect(success).toBe(false);
      expect(affixes[0].tier).toBe(ENHANCE_SIGIL_FAIL_TIER);
      const t1 = getAffixTierTable('defense').find(t => t.tier === ENHANCE_SIGIL_FAIL_TIER)!;
      expect(affixes[0].value).toBeGreaterThanOrEqual(t1.min);
      expect(affixes[0].value).toBeLessThanOrEqual(t1.max);
    });

    it('每跳傷害與回復比例不隨 Tier 變動', () => {
      mockRandom([0.9, 0.5]);
      const affixes: Affix[] = [
        { type: 'element_erosion', tier: 5, value: 14, element: 'ice', dotDamage: 33 },
      ];
      const { affixes: next } = applyEnhanceSigil(affixes, 0);
      expect(next[0].dotDamage).toBe(33);
      expect(next[0].element).toBe('ice');
    });

    it('特殊詞綴無 Tier，不受理', () => {
      const affixes: Affix[] = [{ type: 'resist_stun', tier: 0, value: 0 }];
      expect(canUseSigil('enhance', affixes, 0, {}).ok).toBe(false);
    });
  });

  describe('共通限制（§ 46.9）', () => {
    const affixes: Affix[] = [{ type: 'defense', tier: 5, value: 15 }];

    it('新手裝一律不可使用', () => {
      for (const sigil of SIGIL_DEFINITIONS) {
        expect(canUseSigil(sigil.type, affixes, 0, { isStarterGear: true }).ok).toBe(false);
      }
    });

    it('沒有詞綴時，刺針／重刻／精鍊／突破／工藝不受理，混沌照常', () => {
      expect(canUseSigil('sting', [], undefined, {}).ok).toBe(false);
      expect(canUseSigil('recarve', undefined, undefined, {}).ok).toBe(false);
      expect(canUseSigil('temper', [], 0, {}).ok).toBe(false);
      expect(canUseSigil('enhance', [], 0, {}).ok).toBe(false);
      expect(canUseSigil('polish', [], undefined, {}).ok).toBe(false);
      expect(canUseSigil('chaos', [], undefined, {}).ok).toBe(true);
    });

    it('刺針可以把特殊詞綴換掉', () => {
      const special: Affix[] = [{ type: 'immune_poison', tier: 0, value: 0 }];
      expect(canUseSigil('sting', special, 0, {}).ok).toBe(true);
    });
  });
});
