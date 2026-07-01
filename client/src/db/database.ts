import Dexie, { type Table } from 'dexie';
import type { Character } from '../models/character';
import type { MonsterTemplate } from '../models/monster';
import type { EquipmentTemplate, EquipmentInstance } from '../models/equipment';

export interface UserEntry {
  id?: number;
  createdAt: number;
}

export interface WarehouseEntry {
  id?: number;
  userId: number;
  name: string;
  type: 'equipment' | 'material' | 'potion' | 'scroll' | 'spellbook' | 'gold';
  amount: number;
  storageType: 'personal' | 'shared';
  characterId?: number;
}

export interface DropTableEntry {
  id?: number;
  area: string;
  itemName: string;
  itemType: 'gold' | 'equipment' | 'material' | 'potion' | 'scroll' | 'spellbook';
  dropValue: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface BossDropTableEntry {
  id?: number;
  bossName: string;
  itemName: string;
  itemType: 'gold' | 'equipment' | 'material' | 'potion' | 'scroll' | 'spellbook';
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
  amount: number;
}

export interface CharacterStorageEntry {
  id?: number;
  characterId: number;
  name: string;
  type: 'material' | 'potion' | 'scroll' | 'spellbook';
  amount: number;
}

export class GameDB extends Dexie {
  characters!: Table<Character>;
  monsterTemplates!: Table<MonsterTemplate>;
  equipmentTemplates!: Table<EquipmentTemplate>;
  equipmentInstances!: Table<EquipmentInstance>;
  dropTables!: Table<DropTableEntry>;
  bossDropTables!: Table<BossDropTableEntry>;
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
  }
}

export const db = new GameDB();
