import type { EquipmentTemplate, EquipmentInstance } from '../models/equipment';
import { db } from '../db/database';

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
  'bonusWeight', 'bonusStats', 'blockRate', 'weight',
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
  return resolved;
}

export function resolveEquipmentList(instances: EquipmentInstance[]): EquipmentInstance[] {
  return instances.map(resolveEquipment);
}

export function toStorableInstance(instance: EquipmentInstance): Record<string, unknown> {
  const { id, templateId, quality, enhancement, affixes, element, ownerId, equipped, inStorage } = instance;
  return { id, templateId, quality, enhancement, affixes, element, ownerId, equipped, inStorage };
}
