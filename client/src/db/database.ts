import Dexie, { type Table } from 'dexie';
import type { Character } from '../models/character';
import { generateCharacterUuid } from '../models/characterIdentity';
import type { MonsterTemplate } from '../models/monster';
import type { EquipmentTemplate, EquipmentInstance } from '../models/equipment';
import type { ItemDefinition } from '../models/items';


export interface UserEntry {
  id?: number;
  createdAt: number;
}

export interface WarehouseEntry {
  id?: number;
  userId: number;
  name: string;
  type: 'equipment' | 'material' | 'potion' | 'scroll' | 'spellbook' | 'gold';
  itemTemplateId?: number;
  amount: number;
  storageType: 'personal' | 'shared';
  characterId?: number;
}

export interface DropTableEntry {
  id?: number;
  area: string;
  itemType: 'gold' | 'equipment' | 'item';
  equipmentTemplateId?: number;
  equipmentPool?: 'weapon' | 'armor' | 'all';
  acquireType?: 'shop' | 'craft';
  shopTier?: 'low' | 'mid' | 'high';
  craftTier?: 'entry' | 'mid' | 'top';
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
  shopTier?: 'low' | 'mid' | 'high';
  itemTemplateId?: number;
  dropValue: number;
  minAmount?: number;
  maxAmount?: number;
  craftTier?: 'entry' | 'mid' | 'top';
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

export class GameDB extends Dexie {
  characters!: Table<Character>;
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
  }
}

export const db = new GameDB();
