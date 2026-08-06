import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db } from '../database';
import { seedDatabase, resetSeedState } from '../seed';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import { loadTemplateCache, getTemplateById } from '../../systems/templateSync';
import { CURRENT_DATA_VERSION } from '../../config';

/**
 * 舊玩家（v15）升上 v16 之後，既有存檔必須完好。
 *
 * 這一版同時改了兩件會碰到玩家資料的事：
 * 1. 倉庫金幣搬到 `warehouseGold`（Dexie 遷移）
 * 2. `craftPrerequisiteWeapon` 從 `{name}` 改成 `{templateId}`（模板欄位，靠 re-seed 覆寫）
 *
 * 第 2 點靠的是 `performSeed()` 的 `bulkPut` 會整筆覆寫既有模板。
 * 如果哪天改成「DB 非空就跳過 seed」，舊玩家的模板會停在 `{name}` 形狀，
 * 前置武器判定讀到 `undefined` 而永遠不成立 —— 這個測試就是那道防線。
 */
describe('v15 舊存檔升級到 v16', () => {
  const DB_NAME = 'MayanaIdleDB';

  /** 拿一組真實的「產品 ← 前置」配對來驗 */
  const PRODUCT = EQUIPMENT_SEEDS.find(e => e.name === '碎星劍')!;
  const PREREQ_ID = PRODUCT.craftPrerequisiteWeapon!.templateId;
  const PREREQ = EQUIPMENT_SEEDS.find(e => e.id === PREREQ_ID)!;

  beforeEach(async () => {
    db.close();
    await Dexie.delete(DB_NAME);
    resetSeedState();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(DB_NAME);
    resetSeedState();
  });

  /** 以 v15 的結構與**當時的欄位形狀**寫入一個舊玩家的存檔 */
  async function seedV15Player() {
    const legacy = new Dexie(DB_NAME);
    legacy.version(15).stores({
      characters: '++id, name, className, createdAt, userId, uuid',
      users: '++id',
      equipmentTemplates: '++id, name, type, slot, acquireType',
      equipmentInstances: '++id, templateId, ownerId, equipped',
      characterBag: '++id, characterId, name, type, itemTemplateId',
      characterStorage: '++id, characterId, name, type, itemTemplateId',
      warehouses: '++id, userId, name, type, storageType, characterId, itemTemplateId',
    });
    await legacy.open();

    await legacy.table('users').add({ id: 1, createdAt: 0 });
    await legacy.table('characters').add({
      id: 1, uuid: 'uuid-veteran', userId: 1, name: '老玩家', className: 'knight',
      level: 40, exp: 0, expToNext: 100, hp: 500, maxHp: 500, mp: 100, maxMp: 100,
      baseAttributes: { STR: 20, AGI: 10, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      unspentAttributePoints: 0, gold: 12345,
      currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
      currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
      dataVersion: CURRENT_DATA_VERSION,
    });

    // 舊形狀的模板：craftPrerequisiteWeapon 還是 { name, quantity }
    await legacy.table('equipmentTemplates').bulkAdd([
      { ...PREREQ },
      { ...PRODUCT, craftPrerequisiteWeapon: { name: PREREQ.name, quantity: 1 } },
    ]);

    // 玩家身上那把前置武器（強化過、有詞綴，素質不影響前置判定）
    await legacy.table('equipmentInstances').add({
      id: 500, templateId: PREREQ_ID, ownerId: 1, equipped: false,
      quality: 12, enhancement: 5, affixes: [{ id: 'atk1', tier: 3, value: 7 }],
    });

    await legacy.table('warehouses').bulkAdd([
      { userId: 1, name: 'gold', type: 'gold', amount: 987654, storageType: 'shared' },
      { userId: 1, name: '銀礦石', type: 'material', itemTemplateId: 11, amount: 42, storageType: 'shared' },
    ]);

    legacy.close();
  }

  /** 重現 `App.tsx` 開機時做的事：開 DB（跑遷移）→ seed → 載入模板快取 */
  async function bootLikeApp() {
    await db.open();
    await seedDatabase();
    await loadTemplateCache();
  }

  it('倉庫金幣完整搬進 warehouseGold，一塊都不少', async () => {
    await seedV15Player();
    await bootLikeApp();

    expect((await db.warehouseGold.get(1))?.amount).toBe(987654);
    const rows = await db.warehouses.where('userId').equals(1).toArray();
    expect(rows.map(r => r.name)).toEqual(['銀礦石']);
    expect(rows[0].amount).toBe(42);
  });

  it('角色本身與其金幣不受影響', async () => {
    await seedV15Player();
    await bootLikeApp();

    const char = await db.characters.get(1);
    expect(char).toBeDefined();
    expect(char!.gold).toBe(12345);
    expect(char!.level).toBe(40);
    // 沒有動 CURRENT_DATA_VERSION，舊角色不該被資料版本淘汰帶走
    expect(char!.dataVersion).toBe(CURRENT_DATA_VERSION);
  });

  it('re-seed 把舊形狀的 craftPrerequisiteWeapon 覆寫成 templateId', async () => {
    await seedV15Player();
    await bootLikeApp();

    const stored = await db.equipmentTemplates.get(PRODUCT.id!);
    expect(stored!.craftPrerequisiteWeapon).toEqual({ templateId: PREREQ_ID, quantity: 1 });
    // 舊欄位必須真的消失，不是新舊並存
    expect((stored!.craftPrerequisiteWeapon as unknown as Record<string, unknown>).name).toBeUndefined();

    // 記憶體快取（實際判定讀的來源）也要是新形狀
    expect(getTemplateById(PRODUCT.id!)!.craftPrerequisiteWeapon!.templateId).toBe(PREREQ_ID);
  });

  it('玩家身上的前置武器實例存活，且仍滿足新的 templateId 判定', async () => {
    await seedV15Player();
    await bootLikeApp();

    const inst = await db.equipmentInstances.get(500);
    expect(inst, '前置武器實例不可在升級中被刪掉').toBeDefined();
    expect(inst!.enhancement).toBe(5);
    expect(inst!.quality).toBe(12);

    // 這正是 TownBlacksmith 的判定條件
    const required = getTemplateById(PRODUCT.id!)!.craftPrerequisiteWeapon!;
    const owned = (await db.equipmentInstances.where('ownerId').equals(1).toArray())
      .filter(i => i.templateId === required.templateId).length;
    expect(owned).toBeGreaterThanOrEqual(required.quantity);
  });

  it('重複開機（再跑一次 seed）不會重複搬運或改變金額', async () => {
    await seedV15Player();
    await bootLikeApp();

    db.close();
    resetSeedState();
    await bootLikeApp();

    expect((await db.warehouseGold.get(1))?.amount).toBe(987654);
    expect(await db.warehouseGold.count()).toBe(1);
    expect(await db.equipmentInstances.get(500)).toBeDefined();
  });
});
