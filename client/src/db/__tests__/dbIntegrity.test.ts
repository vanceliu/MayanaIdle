import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../database';
import { seedDatabase, resetSeedState, EQUIPMENT_SEEDS, DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../seed';
import { loadTemplateCache, resolveEquipment } from '../../systems/templateSync';
import { getItemById } from '../../models/items';
import { ITEM_DEFINITIONS } from '../seed/itemSeeds';

/**
 * 深入驗證：DB seed 後角色裝備、掉落表、製作配方全部能正確對應
 */
describe('DB 完整性驗證 — 角色/裝備/掉落對應', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resetSeedState();
    await seedDatabase();
    await loadTemplateCache();
  });

  describe('equipmentTemplates 完整性', () => {
    it('所有 EQUIPMENT_SEEDS 都已寫入 DB', async () => {
      const dbTemplates = await db.equipmentTemplates.toArray();
      const dbNames = new Set(dbTemplates.map(t => t.name));
      for (const seed of EQUIPMENT_SEEDS) {
        expect(dbNames.has(seed.name), `${seed.name} not in DB`).toBe(true);
      }
    });

    it('DB 中的 craftMaterials 與 SEEDS 一致', async () => {
      const craftSeeds = EQUIPMENT_SEEDS.filter(s => s.craftMaterials && s.craftMaterials.length > 0);
      for (const seed of craftSeeds) {
        const dbTemplate = await db.equipmentTemplates.where('name').equals(seed.name).first();
        expect(dbTemplate, `${seed.name} not found in DB`).toBeDefined();
        expect((dbTemplate as any).craftMaterials).toEqual(seed.craftMaterials);
      }
    });

    it('所有裝備 template 都能被 resolveEquipment 正確解析', async () => {
      const dbTemplates = await db.equipmentTemplates.toArray();
      for (const template of dbTemplates) {
        const mockInstance = {
          id: 9999,
          templateId: template.id!,
          name: template.name,
          type: template.type,
          slot: template.slot,
          isTwoHanded: template.isTwoHanded,
          smallMonsterDamage: template.smallMonsterDamage,
          largeMonsterDamage: template.largeMonsterDamage,
          quality: 0,
          enhancement: 0,
          affixes: [],
          ownerId: 1,
          equipped: false,
        };
        const resolved = resolveEquipment(mockInstance as any);
        expect(resolved.name).toBe(template.name);
        expect(resolved.type).toBe(template.type);
        expect(resolved.slot).toBe(template.slot);
      }
    });
  });

  describe('dropTables 完整性', () => {
    it('DB dropTables 數量與 SEEDS 一致', async () => {
      const dbCount = await db.dropTables.count();
      expect(dbCount).toBe(DROP_TABLE_SEEDS.length);
    });

    it('DB bossDropTables 數量與 SEEDS 一致', async () => {
      const dbCount = await db.bossDropTables.count();
      expect(dbCount).toBe(BOSS_DROP_TABLE_SEEDS.length);
    });

    it('所有掉落的裝備都有對應 equipmentTemplate', async () => {
      const equipDrops = DROP_TABLE_SEEDS.filter(d => d.itemType === 'equipment' && d.equipmentTemplateId);
      const dbTemplates = await db.equipmentTemplates.toArray();
      const templateIds = new Set(dbTemplates.map(t => t.id));

      const missing: number[] = [];
      for (const drop of equipDrops) {
        if (!templateIds.has(drop.equipmentTemplateId!)) {
          missing.push(drop.equipmentTemplateId!);
        }
      }
      expect(missing).toEqual([]);
    });

    it('所有 Boss 掉落的裝備都有對應 equipmentTemplate（排除動態掉落）', async () => {
      const equipDrops = BOSS_DROP_TABLE_SEEDS.filter(
        d => d.itemType === 'equipment' && d.equipmentTemplateId && !d.equipmentPool
      );
      const dbTemplates = await db.equipmentTemplates.toArray();
      const templateIds = new Set(dbTemplates.map(t => t.id));

      const missing: number[] = [];
      for (const drop of equipDrops) {
        if (!templateIds.has(drop.equipmentTemplateId!)) {
          missing.push(drop.equipmentTemplateId!);
        }
      }
      expect(missing).toEqual([]);
    });
  });

  describe('模擬既有角色載入', () => {
    it('既有角色裝備 instance 可正確 resolve', async () => {
      const template = await db.equipmentTemplates.where('name').equals('鋼鐵之劍').first();
      expect(template).toBeDefined();

      await db.equipmentInstances.add({
        templateId: template!.id!,
        name: '鋼鐵之劍',
        type: 'sword',
        slot: 'rightHand',
        isTwoHanded: false,
        smallMonsterDamage: 6,
        largeMonsterDamage: 5,
        quality: 10,
        enhancement: 3,
        stability: 6,
        affixes: [],
        ownerId: 1,
        equipped: true,
      } as any);

      const instances = await db.equipmentInstances.toArray();
      expect(instances.length).toBe(1);

      const resolved = resolveEquipment(instances[0] as any);
      expect(resolved.name).toBe('鋼鐵之劍');
      expect(resolved.slot).toBe('rightHand');
      expect(resolved.quality).toBe(10);
      expect(resolved.enhancement).toBe(3);
    });

    it('既有角色背包素材名稱在新配方或系統中仍有效', async () => {
      // 鐵匠製作止於 T5（T6/T7 為掉落限定，§ 6A.8.0），因此配方只用到銀與米索利兩種基底。
      // 奧里哈魯根碎片等頂級素材在頂級配方移除後**暫時只剩賣店價值**，
      // 這是已知的待補缺口（見 `99-ai-constraints.md` § 99.4「孤兒素材」）。
      const craftMaterials = ['銀礦石', '米索利碎片'];
      const craftSeeds = EQUIPMENT_SEEDS.filter(s => s.craftMaterials && s.craftMaterials.length > 0);

      for (const mat of craftMaterials) {
        const usedIn = craftSeeds.filter(s => s.craftMaterials!.some(m => m.name === mat));
        expect(usedIn.length, `${mat} 未在任何配方中使用`).toBeGreaterThan(0);
      }

      // 頂級素材目前無配方用途，但必須保有賣店價值，否則玩家打 Boss 的掉落等於全廢
      for (const mat of ['奧里哈魯根碎片', '遠古騎士紋章', '巨龍逆鱗']) {
        const def = ITEM_DEFINITIONS.find(i => i.name === mat);
        expect(def, `${mat} 不存在於道具定義`).toBeDefined();
        expect(def!.sellPrice ?? 0, `${mat} 沒有賣店價值`).toBeGreaterThan(0);
      }

      // 品質石、強化石用於鐵匠鋪品質提升/詞綴強化，不在 craftMaterials 中但仍有明確用途
      const systemMaterials = ['品質石', '強化石'];
      for (const mat of systemMaterials) {
        const drops = DROP_TABLE_SEEDS.filter(d => {
          if (d.itemType !== 'item' || !d.itemTemplateId) return false;
          return getItemById(d.itemTemplateId)?.name === mat;
        });
        expect(drops.length, `${mat} 未在任何掉落表中`).toBeGreaterThan(0);
      }
    });

    it('重新 seed 不會影響既有裝備 instance', async () => {
      const template = await db.equipmentTemplates.where('name').equals('銀騎士之劍').first();
      await db.equipmentInstances.add({
        templateId: template!.id!,
        name: '銀騎士之劍',
        type: 'sword',
        slot: 'rightHand',
        isTwoHanded: false,
        smallMonsterDamage: 9,
        largeMonsterDamage: 8,
        quality: 15,
        enhancement: 5,
        stability: 6,
        affixes: [{ id: 'atk1', tier: 2, value: 3 }],
        ownerId: 1,
        equipped: true,
      } as any);

      resetSeedState();
      await seedDatabase();
      await loadTemplateCache();

      const instances = await db.equipmentInstances.toArray();
      const myWeapon = instances.find(i => i.name === '銀騎士之劍');
      expect(myWeapon).toBeDefined();
      expect((myWeapon as any).quality).toBe(15);
      expect((myWeapon as any).enhancement).toBe(5);
      expect((myWeapon as any).affixes).toHaveLength(1);
    });
  });
});
