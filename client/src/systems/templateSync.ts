import type { EquipmentTemplate, EquipmentInstance } from '../models/equipment';
import { db } from '../db/database';
import { isAccessorySlot } from '../models/equipment';
import { getAccessoryStatMultiplier } from './enhancement';

/** 飾品強化倍率作用的欄位（§ 6.10.1）——不含額外屬性 */
const ACCESSORY_SCALED_FIELDS = ['bonusHp', 'bonusMp', 'hpRegen', 'mpRegen'] as const;

let templateCache: Map<number, EquipmentTemplate> = new Map();
let templateByNameCache: Map<string, EquipmentTemplate> = new Map();

export async function loadTemplateCache(): Promise<void> {
  const templates = await db.equipmentTemplates.toArray();
  templateCache = new Map(templates.map(t => [t.id!, t]));
  templateByNameCache = new Map(templates.map(t => [t.name, t]));
}

export function getTemplateById(id: number): EquipmentTemplate | undefined {
  return templateCache.get(id);
}

export function getTemplateByName(name: string): EquipmentTemplate | undefined {
  return templateByNameCache.get(name);
}

export function isTemplateCacheReady(): boolean {
  return templateCache.size > 0;
}

const TEMPLATE_FIELDS = [
  'name', 'type', 'isTwoHanded',
  'smallMonsterDamage', 'largeMonsterDamage', 'defense',
  'attackSuccess', 'extraAttack', 'magicAttack',
  'bonusHp', 'bonusMp', 'hpRegen', 'mpRegen',
  'bonusWeight', 'bonusBagSlots', 'bonusStats', 'bonusAttributes', 'blockRate', 'weight',
  'material', 'stability', 'requiredClass',
] as const;

export function resolveEquipment(instance: EquipmentInstance): EquipmentInstance {
  const template = templateCache.get(instance.templateId);
  if (!template) return instance;

  const resolved = { ...instance };
  for (const field of TEMPLATE_FIELDS) {
    (resolved as any)[field] = (template as any)[field];
  }
  if (!resolved.slot) {
    resolved.slot = template.slot;
  }

  // 飾品強化的數值倍率（§ 6.10.1）在此統一套用，
  // 避免各消費端（最大HP/MP、回復、面板）各算一份而漂移。
  if (isAccessorySlot(resolved.slot) && (resolved.enhancement ?? 0) > 0) {
    const mult = getAccessoryStatMultiplier(resolved.enhancement ?? 0);
    if (mult > 1) {
      for (const field of ACCESSORY_SCALED_FIELDS) {
        const base = (resolved as any)[field];
        if (typeof base === 'number' && base > 0) {
          (resolved as any)[field] = Math.floor(base * mult);
        }
      }
    }
  }

  return resolved;
}

export function resolveEquipmentList(instances: EquipmentInstance[]): EquipmentInstance[] {
  return instances.map(resolveEquipment);
}

export function toStorableInstance(instance: EquipmentInstance): Record<string, unknown> {
  const { id, templateId, quality, enhancement, affixes, element, ownerId, equipped, inStorage, isStarterGear } = instance;
  return { id, templateId, quality, enhancement, affixes, element, ownerId, equipped, inStorage, ...(isStarterGear ? { isStarterGear } : {}) };
}
