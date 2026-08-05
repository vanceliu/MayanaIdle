import type { EquipmentTemplate, EquipmentInstance, EquipmentTier } from './equipment';

/**
 * 顯示用階級：0 = 新手裝，1~7 = `EquipmentTier`（`06-equipment-acquire.md` § 6A.1）。
 * 新手裝不屬於 tier 刻度，另外給 0 讓批量販售能排除它。
 */
export type EquipmentTierLevel = 0 | EquipmentTier;

/**
 * 裝備階級顏色 —— **與詞綴 Tier 用同一組色階**（`07-affix.md` § 7.3、`App.css` .affix-tag.tier-N），
 * 讓「T5 是橙色」在詞綴與裝備上是同一件事，玩家只需記一套。
 * 新手裝不在 tier 刻度上，用更暗的灰與 T1 區隔。
 */
export const EQUIPMENT_TIER_COLORS: Record<EquipmentTierLevel, string> = {
  0: '#4B5563',  // 新手 - 暗灰
  1: '#6B7280',  // 低階 - 灰
  2: '#9CA3AF',  // 低階 - 亮灰
  3: '#4ADE80',  // 低階 - 綠
  4: '#FACC15',  // 中階 - 黃
  5: '#FB923C',  // 中階 - 橙
  6: '#EF4444',  // 高階 - 紅
  7: '#A855F7',  // 高階 - 紫（帶光暈）
};

export const EQUIPMENT_TIER_NAMES: Record<EquipmentTierLevel, string> = {
  0: '新手',
  1: '低階 T1',
  2: '低階 T2',
  3: '低階 T3',
  4: '中階 T4',
  5: '中階 T5',
  6: '高階 T6',
  7: '高階 T7',
};

/** 階級分組（`06-equipment-acquire.md` § 6A.1）：低階可在商店買到，中／高階只能鐵匠製作 */
export function getTierGroup(tier: EquipmentTier): '低階' | '中階' | '高階' {
  if (tier <= 3) return '低階';
  if (tier <= 5) return '中階';
  return '高階';
}

/**
 * 舊資料相容：`tier` 未填時由 acquireType + shopTier/craftTier 推導。
 * seed 全面補上 `tier` 後可移除。
 */
function deriveLegacyTier(template: EquipmentTemplate): EquipmentTierLevel {
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

export function getEquipmentTierLevel(template: EquipmentTemplate): EquipmentTierLevel {
  return template.tier ?? deriveLegacyTier(template);
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
