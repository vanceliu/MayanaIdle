import { describe, it, expect } from 'vitest';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS, EQUIPMENT_SEEDS } from '../seed';
import { getItemDefinition, ITEM_DEFINITIONS } from '../../models/items';

describe('區域素材掉落系統', () => {
  const materialDrops = DROP_TABLE_SEEDS.filter(d => d.itemType === 'material');
  const bossMaterialDrops = BOSS_DROP_TABLE_SEEDS.filter(d => d.itemType === 'material');

  describe('區域素材定義完整性', () => {
    it('所有 DROP_TABLE 中的素材都有 ItemDefinition', () => {
      const missing: string[] = [];
      for (const drop of materialDrops) {
        if (!getItemDefinition(drop.itemName)) {
          missing.push(drop.itemName);
        }
      }
      expect(missing).toEqual([]);
    });

    it('所有 BOSS_DROP_TABLE 中的素材都有 ItemDefinition', () => {
      const missing: string[] = [];
      for (const drop of bossMaterialDrops) {
        if (!getItemDefinition(drop.itemName)) {
          missing.push(drop.itemName);
        }
      }
      expect(missing).toEqual([]);
    });

    it('所有區域素材（有 sellPrice）的 sellPrice > 0', () => {
      const areaMaterials = ITEM_DEFINITIONS.filter(
        d => d.category === 'material' && d.sellPrice !== undefined
      );
      expect(areaMaterials.length).toBeGreaterThan(0);
      for (const mat of areaMaterials) {
        expect(mat.sellPrice).toBeGreaterThan(0);
      }
    });
  });

  describe('製作配方素材可取得性', () => {
    it('所有 craftMaterials 中的素材都能從掉落表或商店取得', () => {
      const craftEquipments = EQUIPMENT_SEEDS.filter(e => e.craftMaterials && e.craftMaterials.length > 0);
      const allCraftMaterialNames = new Set<string>();
      for (const eq of craftEquipments) {
        for (const mat of eq.craftMaterials!) {
          allCraftMaterialNames.add(mat.name);
        }
      }

      const droppableMaterials = new Set<string>();
      for (const drop of materialDrops) {
        droppableMaterials.add(drop.itemName);
      }
      for (const drop of bossMaterialDrops) {
        droppableMaterials.add(drop.itemName);
      }

      const shopItems = ['紅色藥水', '橙色藥水', '白色藥水', '綠色藥水', '強化綠色藥水', '武器強化卷軸', '防具強化卷軸', '磨刀石'];
      for (const item of shopItems) {
        droppableMaterials.add(item);
      }

      const unobtainable: string[] = [];
      for (const name of allCraftMaterialNames) {
        if (!droppableMaterials.has(name)) {
          unobtainable.push(name);
        }
      }
      expect(unobtainable).toEqual([]);
    });
  });

  describe('百柱塔區域素材掉落', () => {
    it('百柱塔 1~30F 掉落百柱蛛絲、奇美拉角、幻影殘片', () => {
      const areas = ['hundred-pillar-1-10f', 'hundred-pillar-11-20f', 'hundred-pillar-21-30f'];
      for (const area of areas) {
        const areaDrops = DROP_TABLE_SEEDS.filter(d => d.area === area).map(d => d.itemName);
        expect(areaDrops).toContain('百柱蛛絲');
        expect(areaDrops).toContain('奇美拉角');
        expect(areaDrops).toContain('幻影殘片');
      }
    });

    it('百柱塔 31~60F 掉落不死骨髓、古龍牙、女妖淚珠', () => {
      const areas = ['hundred-pillar-31-40f', 'hundred-pillar-41-50f', 'hundred-pillar-51-60f'];
      for (const area of areas) {
        const areaDrops = DROP_TABLE_SEEDS.filter(d => d.area === area).map(d => d.itemName);
        expect(areaDrops).toContain('不死骨髓');
        expect(areaDrops).toContain('古龍牙');
        expect(areaDrops).toContain('女妖淚珠');
      }
    });

    it('百柱塔 61~100F 掉落霜凍結晶、熔岩核、殘影精華', () => {
      const areas = ['hundred-pillar-61-70f', 'hundred-pillar-71-80f', 'hundred-pillar-81-90f', 'hundred-pillar-91-100f'];
      for (const area of areas) {
        const areaDrops = DROP_TABLE_SEEDS.filter(d => d.area === area).map(d => d.itemName);
        expect(areaDrops).toContain('霜凍結晶');
        expect(areaDrops).toContain('熔岩核');
        expect(areaDrops).toContain('殘影精華');
      }
    });
  });

  describe('Boss 專屬素材掉落', () => {
    const BOSS_UNIQUE_MATERIALS = [
      '試煉飛龍之鱗', '雪地之主的凍心', '惡魔之瞳', '蛇魔毒囊', '獄王深海珠',
      '巨龍逆鱗', '遠古騎士紋章',
      '皇女毒腺', '哥布林王冠碎片', '吸血鬼血晶',
      '殭屍王心臟', '約特勒龍鱗', '冥王靈魂石',
      '伊莉絲霜核', '伊弗利特熔心', '守護者印記', '死神碎魂',
    ];

    it('每個 Boss 專屬素材名稱不重複', () => {
      const uniqueNames = new Set(BOSS_UNIQUE_MATERIALS);
      expect(uniqueNames.size).toBe(BOSS_UNIQUE_MATERIALS.length);
    });

    it('所有 Boss 專屬素材都在 BOSS_DROP_TABLE_SEEDS 中', () => {
      const bossDropNames = BOSS_DROP_TABLE_SEEDS.map(d => d.itemName);
      for (const name of BOSS_UNIQUE_MATERIALS) {
        expect(bossDropNames).toContain(name);
      }
    });

    it('Boss 專屬素材掉落率為 30%（dropValue 300）', () => {
      const uniqueDrops = BOSS_DROP_TABLE_SEEDS.filter(
        d => BOSS_UNIQUE_MATERIALS.includes(d.itemName)
      );
      for (const drop of uniqueDrops) {
        expect(drop.dropValue).toBe(300);
      }
    });

    it('每個 Boss 只掉一種專屬素材', () => {
      const bossNames = [...new Set(BOSS_DROP_TABLE_SEEDS.map(d => d.bossName))];
      for (const boss of bossNames) {
        const uniqueDropsForBoss = BOSS_DROP_TABLE_SEEDS.filter(
          d => d.bossName === boss && BOSS_UNIQUE_MATERIALS.includes(d.itemName)
        );
        expect(uniqueDropsForBoss.length).toBe(1);
      }
    });
  });

  describe('賣價計算', () => {
    it('getSellPrice 讀取 ItemDefinition 的 sellPrice', () => {
      const def = getItemDefinition('破碎獸牙');
      expect(def).toBeDefined();
      expect(def!.sellPrice).toBe(4);
    });

    it('有 sellPrice 的素材，實際賣價 = sellPrice * 0.5', () => {
      const def = getItemDefinition('山賊鐵塊');
      expect(def).toBeDefined();
      expect(Math.floor(def!.sellPrice! * 0.5)).toBe(70);
    });

    it('沒有 sellPrice 但有 buyPrice 的物品，以 buyPrice 為基準', () => {
      const def = getItemDefinition('紅色藥水');
      expect(def).toBeDefined();
      expect(def!.sellPrice).toBeUndefined();
      expect(def!.buyPrice).toBe(25);
      expect(Math.floor(def!.buyPrice! * 0.5)).toBe(12);
    });
  });

  describe('掉落率合理性', () => {
    it('區域素材掉落率在 10~12% 範圍內（dropValue 100~120）', () => {
      const areaMaterialNames = ITEM_DEFINITIONS
        .filter(d => d.category === 'material' && d.sellPrice !== undefined)
        .map(d => d.name);

      const areaMatDrops = DROP_TABLE_SEEDS.filter(
        d => d.itemType === 'material' && areaMaterialNames.includes(d.itemName)
      );

      for (const drop of areaMatDrops) {
        expect(drop.dropValue).toBeGreaterThanOrEqual(100);
        expect(drop.dropValue).toBeLessThanOrEqual(120);
      }
    });

    it('每個有怪物的區域都有金幣掉落', () => {
      const areas = [...new Set(DROP_TABLE_SEEDS.map(d => d.area))];
      for (const area of areas) {
        const goldDrop = DROP_TABLE_SEEDS.find(d => d.area === area && d.itemName === '金幣');
        expect(goldDrop).toBeDefined();
      }
    });
  });
});
