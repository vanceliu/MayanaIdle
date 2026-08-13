import { describe, it, expect } from 'vitest';
import {
  SHOP_SELL_RATE,
  getItemBasePrice,
  getItemSellPrice,
  isSellableItem,
  collectSellableMaterials,
  collectProtectedMaterials,
  getMaterialsSellTotal,
  getEquipmentSellPrice,
  isSellableEquipment,
  isWeaponInstance,
  collectBatchSellEquipment,
  getEquipmentSellTotal,
} from '../shop';
import { makeBagItem } from '../../models/bagItem';
import type { BagItem } from '../../models/bagItem';
import { hasMaterialUsage } from '../craftMaterialUsage';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';

/**
 * 定價與可賣判定的唯一來源（`39-batch-sell.md`）。
 * 三家商店與之後的村莊腳本自動販售都走這裡，所以這組測試守的是
 * 「手動賣」與「腳本自動賣」拿到同一個金額。
 */

// 破碎獸牙：iconTier 1、純販售素材、sellPrice 14
const TUSK = 19;
// 銀礦石：iconTier 2、配方素材、sellPrice 50
const SILVER_ORE = 11;
// 紅色藥水：buyPrice 25，沒有 sellPrice
const RED_POTION = 1;

const TEMPLATES: EquipmentTemplate[] = [
  { id: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, smallMonsterDamage: 10, largeMonsterDamage: 8, buyPrice: 1000, acquireType: 'shop', tier: 2 },
  { id: 2, name: '新手劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, smallMonsterDamage: 4, largeMonsterDamage: 3, buyPrice: 100, acquireType: 'starter', tier: 1 },
  { id: 3, name: '龍鱗甲', type: 'armor', slot: 'chest', isTwoHanded: false, defense: 50, craftGold: 8000, acquireType: 'craft', tier: 5, craftTier: 'mid' },
  { id: 4, name: '深淵之刃', type: 'sword', slot: 'rightHand', isTwoHanded: false, smallMonsterDamage: 90, largeMonsterDamage: 80, buyPrice: 50_000, acquireType: 'drop_only', tier: 7 },
] as EquipmentTemplate[];

function instance(templateId: number, overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  const t = TEMPLATES.find(x => x.id === templateId)!;
  return {
    id: 100 + templateId,
    templateId,
    name: t.name,
    type: t.type,
    slot: t.slot,
    isTwoHanded: false,
    smallMonsterDamage: t.smallMonsterDamage,
    defense: t.defense,
    enhancement: 0,
    affixes: [],
    ...overrides,
  } as EquipmentInstance;
}

describe('道具定價', () => {
  it('回收價是基準價的一半（無條件捨去）', () => {
    expect(SHOP_SELL_RATE).toBe(0.5);
    expect(getItemBasePrice(TUSK)).toBe(14);
    expect(getItemSellPrice(TUSK)).toBe(7);
  });

  it('沒有 sellPrice 時退回 buyPrice', () => {
    expect(getItemBasePrice(RED_POTION)).toBe(25);
    expect(getItemSellPrice(RED_POTION)).toBe(12);
  });

  it('不存在的道具賣不掉', () => {
    expect(isSellableItem(999_999)).toBe(false);
    expect(getItemSellPrice(999_999)).toBe(0);
  });
});

describe('素材批量販售', () => {
  const bag = [makeBagItem(TUSK, 3), makeBagItem(SILVER_ORE, 2), makeBagItem(RED_POTION, 5)] as BagItem[];

  it('只挑素材，藥水不會被掃掉', () => {
    const picked = collectSellableMaterials(bag, 7);
    expect(picked.some(i => i.itemId === RED_POTION)).toBe(false);
  });

  it('預設保護配方素材', () => {
    // 前提：銀礦石確實是配方素材
    expect(hasMaterialUsage(SILVER_ORE)).toBe(true);

    const picked = collectSellableMaterials(bag, 7);
    expect(picked.map(i => i.itemId)).toEqual([TUSK]);
  });

  it('關掉保護後配方素材也會賣', () => {
    const picked = collectSellableMaterials(bag, 7, { skipCraftMaterials: false });
    expect(picked.map(i => i.itemId).sort()).toEqual([SILVER_ORE, TUSK].sort());
  });

  it('tier 門檻以下才算', () => {
    expect(collectSellableMaterials(bag, 1).map(i => i.itemId)).toEqual([TUSK]);
    expect(collectSellableMaterials([makeBagItem(SILVER_ORE, 1)] as BagItem[], 1, { skipCraftMaterials: false })).toEqual([]);
  });

  it('被保護擋下的素材可以列出來給玩家看', () => {
    expect(collectProtectedMaterials(bag, 7).map(i => i.itemId)).toEqual([SILVER_ORE]);
  });

  it('總價乘上持有數量', () => {
    expect(getMaterialsSellTotal([makeBagItem(TUSK, 3)] as BagItem[])).toBe(21);
  });
});

describe('裝備定價與可賣判定', () => {
  it('商店裝備用買價一半', () => {
    expect(getEquipmentSellPrice(instance(1), TEMPLATES)).toBe(500);
  });

  it('製作裝備用 craftGold 一半', () => {
    expect(getEquipmentSellPrice(instance(3), TEMPLATES)).toBe(4000);
  });

  it('新手裝不能賣（靠模板的 acquireType，不是靠實例旗標）', () => {
    // 創角直接穿上的那套沒有 isStarterGear 旗標
    expect(getEquipmentSellPrice(instance(2), TEMPLATES)).toBe(0);
    expect(isSellableEquipment(instance(2), TEMPLATES, new Set())).toBe(false);
  });

  it('穿在身上的不列入出售清單', () => {
    const worn = instance(1);
    expect(isSellableEquipment(worn, TEMPLATES, new Set([worn.id]))).toBe(false);
    expect(isSellableEquipment(worn, TEMPLATES, new Set())).toBe(true);
  });

  it('武器與防具用小怪傷害區分', () => {
    expect(isWeaponInstance(instance(1))).toBe(true);
    expect(isWeaponInstance(instance(3))).toBe(false);
  });
});

describe('裝備批量販售', () => {
  it('等級門檻以下才收', () => {
    const items = [instance(1), instance(3)];
    // 鐵劍 = 商店中階（2）、龍鱗甲 = 製作進階（5）
    expect(collectBatchSellEquipment(items, TEMPLATES, 2).map(i => i.name)).toEqual(['鐵劍']);
    expect(collectBatchSellEquipment(items, TEMPLATES, 5)).toHaveLength(2);
  });

  it('drop_only 與新手裝一律排除，不被「Tier N 以下」掃到', () => {
    const items = [instance(2), instance(4)];
    expect(collectBatchSellEquipment(items, TEMPLATES, 6)).toEqual([]);
  });

  it('總價是各件回收價相加', () => {
    expect(getEquipmentSellTotal([instance(1), instance(3)], TEMPLATES)).toBe(4500);
  });
});
