import type { EquipmentInstance, EquipSlot } from '../models/equipment';
import type { ClassName } from '../models/character';
import { db } from '../db/database';
import { resolveEquipment } from './templateSync';

const STARTER_MAX_LEVEL = 30;
const STARTER_ENHANCE_COST = 500;

interface StarterGearSet {
  weapons: string[];
  armor: string[];
}

const STARTER_GEAR_MAP: Record<ClassName, StarterGearSet> = {
  knight: {
    weapons: ['新手劍', '新手盾'],
    armor: ['新手鐵盔', '新手鎖甲', '新手鐵手甲', '新手鐵靴', '皮腰帶'],
  },
  elf: {
    weapons: ['新手弓'],
    armor: ['新手皮帽', '新手皮甲', '新手皮手套', '新手皮靴', '皮腰帶'],
  },
  elementalist: {
    weapons: ['新手法杖', '新手魔導書'],
    armor: ['新手法師頭巾', '新手法師長袍', '新手法師手套', '新手布鞋', '皮腰帶'],
  },
  priest: {
    weapons: ['新手鐵鎚', '新手盾'],
    armor: ['新手法師頭巾', '新手法師長袍', '新手法師手套', '新手布鞋', '皮腰帶'],
  },
  thief: {
    weapons: ['新手匕首'],
    armor: ['新手面罩', '新手盜賊皮衣', '新手護腕', '新手疾風靴', '皮腰帶'],
  },
};

export function getStarterGearNames(className: ClassName): string[] {
  const set = STARTER_GEAR_MAP[className];
  return [...set.weapons, ...set.armor];
}

export function canClaimStarterGear(level: number): boolean {
  return level <= STARTER_MAX_LEVEL;
}

export function getStarterEnhanceCost(): number {
  return STARTER_ENHANCE_COST;
}

export function getStarterEnhanceMax(item: EquipmentInstance): number {
  return item.stability ?? 0;
}

export function canEnhanceStarterGear(item: EquipmentInstance): boolean {
  if (!item.isStarterGear) return false;
  const max = getStarterEnhanceMax(item);
  if (max <= 0) return false;
  return item.enhancement < max;
}

export function enhanceStarterGear(item: EquipmentInstance): EquipmentInstance {
  const newEnhancement = item.enhancement + 1;
  const updated = { ...item, enhancement: newEnhancement };
  return updated;
}

export interface ClaimResult {
  claimed: EquipmentInstance[];
  alreadyOwned: string[];
}

export async function claimStarterGear(
  characterId: number,
  className: ClassName,
  level: number,
  ownedEquipment: EquipmentInstance[],
): Promise<ClaimResult> {
  if (!canClaimStarterGear(level)) {
    return { claimed: [], alreadyOwned: [] };
  }

  const allNames = getStarterGearNames(className);
  const ownedStarterNames = ownedEquipment
    .filter(e => e.isStarterGear)
    .map(e => e.name);

  const missingNames = allNames.filter(n => !ownedStarterNames.includes(n));
  const alreadyOwned = allNames.filter(n => ownedStarterNames.includes(n));

  const claimed: EquipmentInstance[] = [];

  for (const name of missingNames) {
    const template = await db.equipmentTemplates.where('name').equals(name).first();
    if (!template) continue;

    const dbRecord = {
      templateId: template.id!,
      slot: template.slot as EquipSlot,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: characterId,
      equipped: false,
      isStarterGear: true,
    };

    const instId = await db.equipmentInstances.add(dbRecord as any);
    const instance = resolveEquipment({
      id: instId as number,
      templateId: template.id!,
      name: template.name,
      type: template.type,
      slot: template.slot,
      isTwoHanded: template.isTwoHanded,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: characterId,
      equipped: false,
      isStarterGear: true,
    });
    claimed.push(instance);
  }

  return { claimed, alreadyOwned };
}

export async function persistStarterEnhance(item: EquipmentInstance): Promise<void> {
  await db.equipmentInstances.update(item.id!, { enhancement: item.enhancement });
}
