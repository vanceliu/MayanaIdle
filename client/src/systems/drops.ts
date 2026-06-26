import { db } from '../db/database';
import type { EquipmentInstance } from '../models/equipment';
import { resolveEquipment } from './templateSync';
import { isWeaponSlot } from '../models/equipment';
import { generateAffixes } from '../models/affix';
import type { AffixCategory } from '../models/affix';
import { getRegion } from '../models/mapData';
import { rollClassSkillBookDrop } from './classSkillBookDrop';

export interface DropResult {
  gold: number;
  items: DroppedItem[];
}

export interface DroppedItem {
  name: string;
  type: 'equipment' | 'material' | 'potion' | 'scroll' | 'spellbook';
  amount: number;
  equipmentInstance?: EquipmentInstance;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface DropBonuses {
  drop_rate: number;
  gold_rate: number;
}

export async function rollDrops(areaId: string, ownerId: number, bonuses?: DropBonuses, isBoss: boolean = false, monsterLevel?: number): Promise<DropResult> {
  const entries = await db.dropTables.where('area').equals(areaId).toArray();
  const region = getRegion(areaId);
  const areaLevel = region?.levelMax ?? 1;
  const areaLevelMin = region?.levelMin ?? 1;
  const areaLevelMax = region?.levelMax ?? 1;
  let gold = 0;
  const items: DroppedItem[] = [];
  const dropRateMultiplier = 1 + (bonuses?.drop_rate ?? 0) / 100;
  const goldRateMultiplier = 1 + (bonuses?.gold_rate ?? 0) / 100;

  for (const entry of entries) {
    let effectiveDropValue = entry.dropValue;
    if (monsterLevel && entry.itemType === 'scroll' && entry.itemName.includes('通行卷軸')) {
      const levelRange = Math.max(1, areaLevelMax - areaLevelMin);
      const levelProgress = Math.min(1, (monsterLevel - areaLevelMin) / levelRange);
      effectiveDropValue = Math.min(100, Math.floor(entry.dropValue * (1 + levelProgress)));
    }
    const roll = Math.random() * 1000;
    const boostedDropValue = Math.min(effectiveDropValue * dropRateMultiplier, 1000);
    if (roll >= boostedDropValue) continue;

    if (entry.itemType === 'gold') {
      const baseGold = randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1);
      gold += Math.floor(baseGold * goldRateMultiplier);
    } else if (entry.itemType === 'equipment') {
      const template = await db.equipmentTemplates.where('name').equals(entry.itemName).first();
      if (template) {
        const isWeapon = isWeaponSlot(template.slot);
        const affixCategory: AffixCategory = template.type === 'shield' ? 'shield' : isWeapon ? 'weapon' : 'armor';
        const affixes = generateAffixes(affixCategory, areaLevel, 4, isBoss);
        const dbRecord: Record<string, unknown> = {
          templateId: template.id!,
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
      items.push({
        name: entry.itemName,
        type: entry.itemType as DroppedItem['type'],
        amount: randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1),
      });
    }
  }

  // Class skill book drop (dynamic, based on area level)
  const skillBookDrop = rollClassSkillBookDrop(areaLevel, isBoss);
  if (skillBookDrop) {
    items.push({ name: skillBookDrop, type: 'spellbook', amount: 1 });
  }

  return { gold, items };
}
