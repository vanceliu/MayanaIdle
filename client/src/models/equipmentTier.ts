import type { EquipmentTemplate, EquipmentInstance } from './equipment';

export type EquipmentTierLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const EQUIPMENT_TIER_COLORS: Record<EquipmentTierLevel, string> = {
  0: '#9CA3AF',  // starter - 灰色
  1: '#FFFFFF',  // shop-low - 白色
  2: '#60A5FA',  // shop-mid - 藍色
  3: '#4ADE80',  // shop-high - 綠色
  4: '#FACC15',  // craft-entry - 金色
  5: '#FB923C',  // craft-mid - 橙色
  6: '#EF4444',  // craft-top - 紅色
};

export const EQUIPMENT_TIER_NAMES: Record<EquipmentTierLevel, string> = {
  0: '新手',
  1: '商店低階',
  2: '商店中階',
  3: '商店高階',
  4: '製作入門',
  5: '製作進階',
  6: '製作頂級',
};

export function getEquipmentTierLevel(template: EquipmentTemplate): EquipmentTierLevel {
  if (template.acquireType === 'starter') return 0;
  if (template.acquireType === 'shop') {
    switch (template.shopTier) {
      case 'low': return 1;
      case 'mid': return 2;
      case 'high': return 3;
    }
  }
  if (template.acquireType === 'craft') {
    switch (template.craftTier) {
      case 'entry': return 4;
      case 'mid': return 5;
      case 'top': return 6;
    }
  }
  return 1;
}

export function getEquipmentTierColor(template: EquipmentTemplate): string {
  return EQUIPMENT_TIER_COLORS[getEquipmentTierLevel(template)];
}

export function getEquipmentInstanceTierLevel(
  instance: EquipmentInstance,
  templates: EquipmentTemplate[]
): EquipmentTierLevel {
  if (instance.isStarterGear) return 0;
  const template = templates.find(t => t.id === instance.templateId);
  if (!template) return 1;
  return getEquipmentTierLevel(template);
}

export function getEquipmentInstanceTierColor(
  instance: EquipmentInstance,
  templates: EquipmentTemplate[]
): string {
  return EQUIPMENT_TIER_COLORS[getEquipmentInstanceTierLevel(instance, templates)];
}
