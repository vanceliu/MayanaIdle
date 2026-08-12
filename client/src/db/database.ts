import Dexie, { type Table } from 'dexie';
import { createDefaultAppearance } from '../models/appearance';
import type { Character } from '../models/character';
import { generateCharacterUuid } from '../models/characterIdentity';
import type { MonsterTemplate } from '../models/monster';
import type { EquipmentTemplate, EquipmentInstance, EquipmentTier } from '../models/equipment';
import type { ItemDefinition } from '../models/items';
import type { TalentAffixInstance, TalentSlot } from '../models/talent';
import type { Mail } from '../models/mailbox';
import { ITEM_DEFINITIONS } from './seed/itemSeeds';


export interface UserEntry {
  id?: number;
  createdAt: number;
}

export interface WarehouseEntry {
  id?: number;
  userId: number;
  name: string;
  /**
   * `'gold'` 已於 v16 移除 —— 金幣改存 `warehouseGold` 表（見 `WarehouseGoldEntry`）。
   * 這裡是**物品**的分類，混入一個餘額用的假分類會讓每個走訪倉庫的迴圈
   * 都得先記得跳過它，而漏掉的那個就會把餘額當成一疊道具。
   */
  type: 'equipment' | 'material' | 'potion' | 'scroll' | 'spellbook';
  itemTemplateId?: number;
  amount: number;
  storageType: 'personal' | 'shared';
  characterId?: number;
}

/**
 * 共用倉庫的金幣餘額，一個帳號一列（`18-data-schema.md` § 18.7：
 * 「倉庫另有獨立金幣存放欄位供跨角色轉移」）。
 *
 * 金幣是餘額不是物品：它沒有 `itemTemplateId`、不佔格數、不計重量，
 * 而且線上化後需要「不可為負」的原子扣減（`98-online-architecture.md` § 4）。
 * 與物品同表只能靠 `type` 字串區分，那三個性質一個都保證不了。
 */
export interface WarehouseGoldEntry {
  /** 主鍵。共用倉庫綁帳號層級，故一個 userId 只會有一列 */
  userId: number;
  amount: number;
}

export interface DropTableEntry {
  id?: number;
  area: string;
  itemType: 'gold' | 'equipment' | 'item';
  equipmentTemplateId?: number;
  equipmentPool?: 'weapon' | 'armor' | 'all';
  acquireType?: 'shop' | 'craft';
  /** 掉落池的裝備階級（`06-equipment-acquire.md` § 6A.1）。取代舊的 shopTier / craftTier。 */
  tier?: EquipmentTier;
  itemTemplateId?: number;
  dropValue: number;
  /** 區域內依怪物等級線性遞增的掉落值上限（§ 27.3 以「50~100」標示者）。省略 = 固定值 */
  dropValueMax?: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface BossDropTableEntry {
  id?: number;
  bossName: string;
  itemType: 'gold' | 'equipment' | 'item';
  equipmentTemplateId?: number;
  equipmentPool?: 'weapon' | 'armor' | 'all';
  acquireType?: 'shop' | 'craft';
  /** 掉落池的裝備階級（`06-equipment-acquire.md` § 6A.1）。取代舊的 shopTier / craftTier。 */
  tier?: EquipmentTier;
  itemTemplateId?: number;
  dropValue: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface CharacterBagEntry {
  id?: number;
  characterId: number;
  name: string;
  type: 'material' | 'potion' | 'scroll' | 'spellbook';
  itemTemplateId?: number;
  amount: number;
}

export interface CharacterStorageEntry {
  id?: number;
  characterId: number;
  name: string;
  type: 'material' | 'potion' | 'scroll' | 'spellbook';
  itemTemplateId?: number;
  amount: number;
}

/**
 * 遺產封存（§ 45.2）。`payload` 必須是 JSON **字串**，不可存成物件 ——
 * 存物件等於把當時的型別結構寫進 DB，日後型別改動會讓舊紀錄變成無法解讀的殘骸。
 */
export interface LegacyArchiveEntry {
  id?: number;
  userId: number;
  type: 'character' | 'sharedWarehouse';
  /** 列表用摘要，不需解析 payload 即可顯示 */
  label: string;
  className?: string;
  level?: number;
  dataVersion: number;
  archivedAt: number;
  payload: string;
}

/**
 * 詞綴升階與品質提升移交印記師（`46-sigil.md` § 46.1）時三個道具一併改名，並改歸 `scroll`。
 *
 * 當時背包／倉庫是**用名字當 key** 的，舊名留在玩家的 IndexedDB 裡就等於這批道具
 * 永遠找不到，所以改名必須連同存量一起遷移。v15 之後鍵已改為 `itemTemplateId`
 * （`99-ai-constraints.md` § 99.1），往後改名不再需要這種遷移；這段留著是給
 * 尚未升到 v14 的舊資料用的。
 */
export const LEGACY_ITEM_RENAMES: Record<string, string> = {
  品質石: '工藝印記',
  強化石: '精鍊印記',
  強化印記: '突破印記',
};

/** 存著道具名的三張表（角色背包／角色倉庫／共用倉庫） */
export const RENAMED_ITEM_TABLES = ['characterBag', 'characterStorage', 'warehouses'] as const;

/** 就地改名並修正分類。純函式，讓遷移邏輯能單獨測試。 */
export function renameLegacyItemRow(row: Record<string, unknown>): void {
  const newName = LEGACY_ITEM_RENAMES[row.name as string];
  if (!newName) return;
  row.name = newName;
  // 改名的同時改歸類：三者現在都是 scroll（seed 的 category 同步改過）
  if (row.type === 'material') row.type = 'scroll';
}

export class GameDB extends Dexie {
  characters!: Table<Character>;
  legacyArchives!: Table<LegacyArchiveEntry>;
  monsterTemplates!: Table<MonsterTemplate>;
  equipmentTemplates!: Table<EquipmentTemplate>;
  equipmentInstances!: Table<EquipmentInstance>;
  dropTables!: Table<DropTableEntry>;
  bossDropTables!: Table<BossDropTableEntry>;
  itemTemplates!: Table<ItemDefinition>;
  characterBag!: Table<CharacterBagEntry>;
  characterStorage!: Table<CharacterStorageEntry>;
  users!: Table<UserEntry>;
  warehouses!: Table<WarehouseEntry>;
  warehouseGold!: Table<WarehouseGoldEntry>;
  /** 自動天賦（`51-auto-talent.md`）。鑲材帶 roll 出來的參數，不進 characterBag */
  talentAffixes!: Table<TalentAffixInstance>;
  talentSlots!: Table<TalentSlot>;
  /** 系統信箱（`52-mailbox.md`）。首版只發天賦格 */
  mailbox!: Table<Mail>;

  constructor() {
    super('MayanaIdleDB');
    this.version(1).stores({
      characters: '++id, name, className',
      monsterTemplates: '++id, name, area, level',
      equipmentTemplates: '++id, name, type, slot',
      equipmentInstances: '++id, templateId, ownerId, equipped',
      dropTables: '++id, area, itemType',
    });
    this.version(2).stores({
      characters: '++id, name, className, createdAt',
    });
    this.version(3).stores({
      characters: '++id, name, className, createdAt',
      monsterTemplates: '++id, name, area, level',
      equipmentTemplates: '++id, name, type, slot',
      equipmentInstances: '++id, templateId, ownerId, equipped',
      dropTables: '++id, area, itemType',
      characterBag: '++id, characterId, name, type',
      characterStorage: '++id, characterId, name, type',
    });
    this.version(4).stores({
      characters: '++id, name, className, createdAt, userId',
      monsterTemplates: '++id, name, area, level',
      equipmentTemplates: '++id, name, type, slot',
      equipmentInstances: '++id, templateId, ownerId, equipped',
      dropTables: '++id, area, itemType',
      characterBag: '++id, characterId, name, type',
      characterStorage: '++id, characterId, name, type',
      users: '++id, createdAt',
      warehouses: '++id, userId, name, type',
    });
    this.version(5).stores({}).upgrade(async tx => {
      const templates = await tx.table('equipmentTemplates').toArray();
      const templateMap = new Map<string, { attackSuccess?: number; extraAttack?: number; magicAttack?: number }>();
      for (const t of templates) {
        templateMap.set(t.name, {
          attackSuccess: t.attackSuccess,
          extraAttack: t.extraAttack,
          magicAttack: t.magicAttack,
        });
      }
      await tx.table('equipmentInstances').toCollection().modify((instance: Record<string, unknown>) => {
        const tmpl = templateMap.get(instance.name as string);
        if (tmpl) {
          if (instance.attackSuccess == null) instance.attackSuccess = tmpl.attackSuccess;
          if (instance.extraAttack == null) instance.extraAttack = tmpl.extraAttack;
          if (instance.magicAttack == null) instance.magicAttack = tmpl.magicAttack;
        }
      });
    });
    this.version(6).stores({
      bossDropTables: '++id, bossName, itemType',
    });
    this.version(7).stores({
      equipmentInstances: '++id, templateId, ownerId, equipped, inStorage, storageType',
      warehouses: '++id, userId, name, type, storageType, characterId',
    }).upgrade(async tx => {
      await tx.table('equipmentInstances').toCollection().modify((item: Record<string, unknown>) => {
        if (item.inStorage && !item.storageType) {
          item.storageType = 'shared';
        }
      });
      await tx.table('warehouses').toCollection().modify((item: Record<string, unknown>) => {
        if (!item.storageType) {
          item.storageType = 'shared';
        }
      });
    });
    this.version(8).stores({
      equipmentTemplates: '++id, name, type, slot, acquireType',
    });
    this.version(9).stores({
      itemTemplates: 'id, name, category',
    });
    this.version(10).stores({});
    // 詛咒／虛弱／減速改由魔法抗性抵抗（§ 24.4.2），對應的免疫詞綴已移除。
    // 舊實例若殘留這些詞綴，isSpecialAffixType 會回 false 而顯示成一般詞綴，故一併剔除。
    this.version(11).stores({}).upgrade(async tx => {
      const REMOVED = new Set(['immune_curse', 'immune_weaken', 'immune_slow']);
      await tx.table('equipmentInstances').toCollection().modify((item: Record<string, unknown>) => {
        const affixes = item.affixes as { type: string }[] | undefined;
        if (!affixes?.some(a => REMOVED.has(a.type))) return;
        item.affixes = affixes.filter(a => !REMOVED.has(a.type));
      });
    });
    // 排行榜改以全球唯一的 uuid 為 key（§ 37.4.2）。
    // 舊角色只有 IndexedDB 自增 id，每個玩家的第一隻角色都是 1，上傳後會互相覆蓋，故補發 uuid。
    this.version(12).stores({
      characters: '++id, name, className, createdAt, userId, uuid',
    }).upgrade(async tx => {
      await tx.table('characters').toCollection().modify((char: Record<string, unknown>) => {
        if (!char.uuid) char.uuid = generateCharacterUuid();
      });
    });
    // 遺產封存（§ 45）：被 dataVersion 淘汰的角色在刪除前寫入這裡。
    // 註：「清空所有舊角色」不在 Dexie 版本裡做，而是由 `config.ts` 的 CURRENT_DATA_VERSION
    // 搭配 `systems/dataVersionPurge.ts` 處理。Dexie 的版本是給結構遷移用的，
    // 資料淘汰走 dataVersion 這條線，兩者互相獨立。
    this.version(13).stores({
      legacyArchives: '++id, userId, type, archivedAt',
    });
    this.version(14).stores({}).upgrade(async tx => {
      for (const table of RENAMED_ITEM_TABLES) {
        await tx.table(table).toCollection().modify(renameLegacyItemRow);
      }
    });
    /**
     * 背包／倉庫改以 `itemTemplateId` 為鍵（`99-ai-constraints.md` § 99.1）。
     *
     * **只有名稱、沒有 id 的舊列一律廢棄**，不做名稱回填 ——
     * 名稱反查正是這次要拔掉的東西，為了搶救少數早期列而留一條名稱路徑，
     * 等於把問題原封不動帶進新設計。往後只認 id。
     *
     * 有 id 的列順便對齊 seed：`name` 與 `type` 都由 id 反查重寫，
     * 清掉 v14 之前存進來的舊名與錯誤分類。id 已不在 seed 的同樣廢棄。
     */
    this.version(15).stores({
      characterBag: '++id, characterId, name, type, itemTemplateId',
      characterStorage: '++id, characterId, name, type, itemTemplateId',
      warehouses: '++id, userId, name, type, storageType, characterId, itemTemplateId',
    }).upgrade(async tx => {
      const byId = new Map(ITEM_DEFINITIONS.map(i => [i.id, i]));

      for (const table of RENAMED_ITEM_TABLES) {
        await tx.table(table).toCollection().modify(function (this: { value?: unknown }, row: Record<string, unknown>) {
          // 金幣列沒有對應道具（倉庫用 name: 'gold' 存餘額），不參與遷移
          if (row.type === 'gold' || row.type === 'equipment') return;

          const def = typeof row.itemTemplateId === 'number'
            ? byId.get(row.itemTemplateId)
            : undefined;
          if (!def) {
            delete this.value;
            return;
          }
          row.name = def.name;
          row.type = def.category === 'dungeon' ? 'scroll'
            : def.category === 'other' ? 'material'
            : def.category;
        });
      }
    });
    /**
     * 共用倉庫的金幣從 `warehouses` 搬到獨立的 `warehouseGold` 表
     * （`18-data-schema.md` § 18.7 本來就是這樣寫的，實作沒跟上）。
     *
     * 舊資料理論上一個 userId 只有一列金幣，但存檔路徑是「整批刪掉再重寫」，
     * 中途失敗就可能留下重複列。這裡**相加**而不是取第一列 ——
     * 取第一列會在那種情況下靜默吃掉玩家的錢。
     */
    this.version(16).stores({
      warehouseGold: 'userId',
    }).upgrade(async tx => {
      const totals = new Map<number, number>();
      await tx.table('warehouses').toCollection().modify(function (
        this: { value?: unknown },
        row: Record<string, unknown>,
      ) {
        if (row.type !== 'gold') return;
        const userId = row.userId as number;
        const amount = typeof row.amount === 'number' ? row.amount : 0;
        totals.set(userId, (totals.get(userId) ?? 0) + amount);
        delete this.value;
      });
      if (totals.size > 0) {
        await tx.table('warehouseGold').bulkPut(
          [...totals].map(([userId, amount]) => ({ userId, amount })),
        );
      }
    });

    // v17：既有角色補上預設外觀（`04-character.md` § 4.10）。
    // 不補的話舊角色的 appearance 是 undefined，畫面上就沒有角色可畫。
    this.version(17).stores({}).upgrade(async tx => {
      await tx.table('characters').toCollection().modify(row => {
        if (!row.appearance) row.appearance = createDefaultAppearance();
      });
    });

    /**
     * v18：自動天賦（`51-auto-talent.md`）與系統信箱（`52-mailbox.md`）。
     *
     * **只建表，不塞資料。** 起始鑲材與天賦格、以及舊自動腳本規則的重置，
     * 都在角色載入時處理（`18-data-schema.md` § 18.9）——
     * upgrade 拿不到「哪一隻角色現在要用」的上下文，而天賦格與鑲材是逐角色的。
     *
     * `talentAffixes.slotId` 與 `talentSlots.assignedType` 建索引：
     * 判定每 tick 都要撈「這個天賦格鑲了什麼」與「這個類型有哪些格」。
     */
    this.version(18).stores({
      talentAffixes: '++id, characterId, definitionId, slotId',
      talentSlots: '++id, characterId, assignedType, templateId',
      mailbox: '++id, characterId, sourceKey, claimedAt',
    });
  }
}

export const db = new GameDB();
