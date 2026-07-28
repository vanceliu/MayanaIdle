import { db } from '../db/database';
import type { EquipmentInstance } from '../models/equipment';
import { resolveEquipment } from './templateSync';
import { isWeaponSlot } from '../models/equipment';
import { generateAffixes } from '../models/affix';
import type { AffixCategory } from '../models/affix';
import { getRegion } from '../models/mapData';
import { rollClassSkillBookDrop } from './classSkillBookDrop';
import { getItemById, getItemDefinition } from '../models/items';
import type { ItemCategory } from '../models/items';
import { GOLD_RATE_MULTIPLIER, DROP_RATE_MULTIPLIER } from '../config';

export interface DropResult {
  gold: number;
  items: DroppedItem[];
}

type InventoryItemType = 'material' | 'potion' | 'scroll' | 'spellbook';

export interface DroppedItem {
  name: string;
  type: 'equipment' | InventoryItemType;
  itemTemplateId?: number;
  amount: number;
  equipmentInstance?: EquipmentInstance;
}

export function mapItemCategoryToInventoryType(category: ItemCategory): InventoryItemType {
  switch (category) {
    case 'dungeon':
      return 'scroll';
    case 'other':
      return 'material';
    default:
      return category;
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface DropBonuses {
  drop_rate: number;
  gold_rate: number;
}

export const DROP_ROLL_MAX = 1000;

function getDropRateMultiplier(bonuses?: DropBonuses): number {
  return (1 + (bonuses?.drop_rate ?? 0) / 100) * DROP_RATE_MULTIPLIER;
}

export async function rollBossDrops(bossName: string, ownerId: number, areaLevel: number, bonuses?: DropBonuses): Promise<DropResult> {
  const entries = await db.bossDropTables.where('bossName').equals(bossName).toArray();
  let gold = 0;
  const items: DroppedItem[] = [];
  const dropRateMultiplier = getDropRateMultiplier(bonuses);
  const goldRateMultiplier = (1 + (bonuses?.gold_rate ?? 0) / 100) * GOLD_RATE_MULTIPLIER;
  let highTierRolled = false;

  for (const entry of entries) {
    // equipmentPool entries: roll once (10%), then 50/50 weapon or armor
    if (entry.equipmentPool) {
      if (highTierRolled) continue;
      highTierRolled = true;
      const roll = Math.random() * DROP_ROLL_MAX;
      const boostedDropValue = Math.min(entry.dropValue * dropRateMultiplier, DROP_ROLL_MAX);
      if (roll >= boostedDropValue) continue;
      const pickWeapon = Math.random() < 0.5;
      const craftTier = entry.craftTier || 'entry';
      const candidates = await db.equipmentTemplates
        .filter(t => t.acquireType === 'craft' && t.craftTier === craftTier && (pickWeapon ? isWeaponSlot(t.slot) : !isWeaponSlot(t.slot)))
        .toArray();
      if (candidates.length === 0) continue;
      const template = candidates[Math.floor(Math.random() * candidates.length)];
      const isWeapon = isWeaponSlot(template.slot);
      const affixCategory: AffixCategory = template.type === 'shield' ? 'shield' : isWeapon ? 'weapon' : 'armor';
      const affixes = generateAffixes(affixCategory, areaLevel, 4, true);
      const dbRecord: Record<string, unknown> = {
        templateId: template.id!,
        slot: template.slot,
        quality: 0,
        enhancement: 0,
        affixes,
        ownerId,
        equipped: false,
      };
      const id = await db.equipmentInstances.add(dbRecord as any);
      const instance: EquipmentInstance = resolveEquipment({
        id: id as number,
        templateId: template.id!,
        name: template.name,
        type: template.type,
        slot: template.slot,
        isTwoHanded: template.isTwoHanded,
        quality: 0,
        enhancement: 0,
        affixes,
        ownerId,
        equipped: false,
      });
      items.push({ name: template.name, type: 'equipment', amount: 1, equipmentInstance: instance });
      continue;
    }

    const roll = Math.random() * DROP_ROLL_MAX;
    const boostedDropValue = Math.min(entry.dropValue * dropRateMultiplier, DROP_ROLL_MAX);
    if (roll >= boostedDropValue) continue;

    if (entry.itemType === 'gold') {
      const baseGold = randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1);
      gold += Math.floor(baseGold * goldRateMultiplier);
    } else if (entry.itemType === 'equipment') {
      const template = entry.equipmentTemplateId
        ? await db.equipmentTemplates.get(entry.equipmentTemplateId)
        : undefined;
      if (template) {
        const isWeapon = isWeaponSlot(template.slot);
        const affixCategory: AffixCategory = template.type === 'shield' ? 'shield' : isWeapon ? 'weapon' : 'armor';
        const affixes = generateAffixes(affixCategory, areaLevel, 4, true);
        const dbRecord: Record<string, unknown> = {
          templateId: template.id!,
          slot: template.slot,
          quality: 0,
          enhancement: 0,
          affixes,
          ownerId,
          equipped: false,
        };
        const id = await db.equipmentInstances.add(dbRecord as any);
        const instance: EquipmentInstance = resolveEquipment({
          id: id as number,
          templateId: template.id!,
          name: template.name,
          type: template.type,
          slot: template.slot,
          isTwoHanded: template.isTwoHanded,
          quality: 0,
          enhancement: 0,
          affixes,
          ownerId,
          equipped: false,
        });
        items.push({ name: template.name, type: 'equipment', amount: 1, equipmentInstance: instance });
      }
    } else {
      const itemDef = entry.itemTemplateId ? getItemById(entry.itemTemplateId) : undefined;
      if (itemDef) {
        items.push({
          name: itemDef.name,
          type: mapItemCategoryToInventoryType(itemDef.category),
          itemTemplateId: entry.itemTemplateId,
          amount: randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1),
        });
      }
    }
  }

  // Class skill book drop (boss 5%)
  const skillBookDrop = rollClassSkillBookDrop(areaLevel, true, dropRateMultiplier);
  if (skillBookDrop) {
    items.push({
      name: skillBookDrop,
      type: 'spellbook',
      itemTemplateId: getItemDefinition(skillBookDrop)?.id,
      amount: 1,
    });
  }

  return { gold, items };
}

export async function rollDrops(areaId: string, ownerId: number, bonuses?: DropBonuses, isBoss: boolean = false, monsterLevel?: number): Promise<DropResult> {
  const entries = await db.dropTables.where('area').equals(areaId).toArray();
  const region = getRegion(areaId);
  const areaLevel = region?.levelMax ?? 1;
  const areaLevelMin = region?.levelMin ?? 1;
  const areaLevelMax = region?.levelMax ?? 1;
  let gold = 0;
  const items: DroppedItem[] = [];
  const dropRateMultiplier = getDropRateMultiplier(bonuses);
  const goldRateMultiplier = (1 + (bonuses?.gold_rate ?? 0) / 100) * GOLD_RATE_MULTIPLIER;

  for (const entry of entries) {
    let effectiveDropValue = entry.dropValue;
    // Dungeon scroll level-based drop rate boost
    if (monsterLevel && entry.itemType === 'item' && entry.itemTemplateId) {
      const itemDef = getItemById(entry.itemTemplateId);
      if (itemDef?.category === 'dungeon') {
        const levelRange = Math.max(1, areaLevelMax - areaLevelMin);
        const levelProgress = Math.min(1, (monsterLevel - areaLevelMin) / levelRange);
        effectiveDropValue = Math.min(100, Math.floor(entry.dropValue * (1 + levelProgress)));
      }
    }
    const roll = Math.random() * DROP_ROLL_MAX;
    const boostedDropValue = Math.min(effectiveDropValue * dropRateMultiplier, DROP_ROLL_MAX);
    if (roll >= boostedDropValue) continue;

    if (entry.itemType === 'gold') {
      const baseGold = randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1);
      gold += Math.floor(baseGold * goldRateMultiplier);
    } else if (entry.itemType === 'equipment') {
      let template;
      if (entry.equipmentPool) {
        const pool = entry.equipmentPool;
        const candidates = await db.equipmentTemplates
          .filter(t => {
            if (entry.acquireType === 'shop' && entry.shopTier) {
              if (t.acquireType !== 'shop' || t.shopTier !== entry.shopTier) return false;
            } else if (entry.acquireType === 'craft' && entry.craftTier) {
              if (t.acquireType !== 'craft' || t.craftTier !== entry.craftTier) return false;
            }
            if (pool === 'weapon') return isWeaponSlot(t.slot);
            if (pool === 'armor') return !isWeaponSlot(t.slot);
            return true;
          })
          .toArray();
        if (candidates.length > 0) {
          template = candidates[Math.floor(Math.random() * candidates.length)];
        }
      } else if (entry.equipmentTemplateId) {
        template = await db.equipmentTemplates.get(entry.equipmentTemplateId);
      }
      if (template) {
        const isWeapon = isWeaponSlot(template.slot);
        const affixCategory: AffixCategory = template.type === 'shield' ? 'shield' : isWeapon ? 'weapon' : 'armor';
        const affixes = generateAffixes(affixCategory, areaLevel, 4, isBoss);
        const dbRecord: Record<string, unknown> = {
          templateId: template.id!,
          slot: template.slot,
          quality: 0,
          enhancement: 0,
          affixes,
          ownerId,
          equipped: false,
        };
        const id = await db.equipmentInstances.add(dbRecord as any);
        const instance: EquipmentInstance = resolveEquipment({
          id: id as number,
          templateId: template.id!,
          name: template.name,
          type: template.type,
          slot: template.slot,
          isTwoHanded: template.isTwoHanded,
          quality: 0,
          enhancement: 0,
          affixes,
          ownerId,
          equipped: false,
        });
        items.push({ name: template.name, type: 'equipment', amount: 1, equipmentInstance: instance });
      }
    } else {
      const itemDef = entry.itemTemplateId ? getItemById(entry.itemTemplateId) : undefined;
      if (itemDef) {
        items.push({
          name: itemDef.name,
          type: mapItemCategoryToInventoryType(itemDef.category),
          itemTemplateId: entry.itemTemplateId,
          amount: randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1),
        });
      }
    }
  }

  // Class skill book drop (dynamic, based on area level)
  const skillBookDrop = rollClassSkillBookDrop(areaLevel, isBoss, dropRateMultiplier);
  if (skillBookDrop) {
    items.push({
      name: skillBookDrop,
      type: 'spellbook',
      itemTemplateId: getItemDefinition(skillBookDrop)?.id,
      amount: 1,
    });
  }

  return { gold, items };
}
