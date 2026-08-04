export const EFFECT_ICON_MAP: Record<string, string> = {
  // Buffs (category → icon path)
  'accuracy': 'buffs/on-target',
  'fire-enchant': 'buffs/flaming-arrow',
  'defense-buff': 'buffs/shield-reflect',
  'speed': 'buffs/sprint',
  'crit-buff': 'buffs/crosshair',
  'cd-reduction': 'buffs/lightning-helix',
  'element-boost': 'buffs/embrassed-energy',
  'holy-shield': 'buffs/holy-symbol',
  'evasion': 'buffs/dodging',
  'poison-enchant': 'buffs/vile-fluid',
  'atk-debuff': 'buffs/fire-shield',

  // Debuffs (tag → icon path)
  'stun': 'debuffs/stoned-skull',
  'stunned': 'debuffs/stoned-skull',
  'bleeding': 'debuffs/bleeding-wound',
  'poisoned': 'debuffs/poison-gas',
  'defense-down': 'debuffs/broken-shield',
  'atk-down': 'debuffs/stoned-skull',

  // 角色 debuff（category → icon path，見 24-buff-debuff.md § 24.8.2）
  'dot-poison': 'debuffs/poison-gas',
  'dot-bleed': 'debuffs/bleeding-wound',
  'curse': 'debuffs/skull-crossed-bones',
  'weaken': 'debuffs/weaken-arrow',
  'slow': 'debuffs/snail-slow',
};

export const ITEM_ICON_MAP: Record<string, string> = {
  'red-potion': 'items/standing-potion',
  'orange-potion': 'items/bubbling-flask',
  'white-potion': 'items/potion-ball',
  'green-potion': 'items/standing-potion',
  'enhanced-green-potion': 'items/bubbling-flask',
  'scroll': 'items/tied-scroll',
  'town-scroll': 'items/tied-scroll',
  'spellbook': 'items/spell-book',
  'stone': 'items/cut-diamond',
  'whetstone': 'items/clay-brick',
  'material': 'items/cut-diamond',
  'key': 'items/three-keys',
};

import type { MaterialIconType } from './items';

export const MATERIAL_ICON_MAP: Record<MaterialIconType, string> = {
  'ore': 'items/cut-diamond',
  'fabric': 'items/sewing-string',
  'bone': 'items/crossed-bones',
  'crystal': 'items/crystal-cluster',
  'misc': 'items/swap-bag',
  'spellbook-mat': 'items/spell-book',
  'stone': 'items/cut-diamond',
  'whetstone': 'items/clay-brick',
};

export const MATERIAL_TIER_COLORS: Record<number, string> = {
  1: '#FFFFFF',
  2: '#60A5FA',
  3: '#4ADE80',
  4: '#FACC15',
  5: '#FB923C',
  6: '#EF4444',
  7: '#A855F7',
};

export function getMaterialIcon(iconType?: MaterialIconType): string {
  return iconType ? MATERIAL_ICON_MAP[iconType] : ITEM_ICON_MAP['material'];
}

export function getMaterialColor(iconTier?: number): string {
  return iconTier ? MATERIAL_TIER_COLORS[iconTier] : '#FFFFFF';
}

export const EQUIP_ICON_MAP: Record<string, string> = {
  'sword': 'equipment/spinning-sword',
  'dagger': 'equipment/plain-dagger',
  'axe': 'equipment/battle-axe',
  'mace': 'equipment/battle-axe',
  'twoHandSword': 'equipment/two-handed-sword',
  'twoHandAxe': 'equipment/battle-axe',
  'twoHandStaff': 'equipment/wizard-staff',
  'dualBlade': 'equipment/dervish-swords',
  'claw': 'equipment/wolverine-claws',
  'bow': 'equipment/pocket-bow',
  'staff': 'equipment/wizard-staff',
  'shield': 'equipment/edged-shield',
  'magicBook': 'equipment/book-cover',
  'armGuard': 'equipment/gloves', // TODO: 缺專屬臂甲圖示，暫用手套
  'helmet': 'equipment/visored-helm',
  'chest': 'equipment/breastplate',
  'belt': 'equipment/belt-armor',
  'gloves': 'equipment/gloves',
  'boots': 'equipment/boots',
  'necklace': 'items/gem-pendant',
  'ring': 'equipment/ring',
  'ring1': 'equipment/ring',
  'ring2': 'equipment/ring',
};

export const SKILL_ICON_MAP: Record<string, string> = {
  'fire': 'skills/fire-zone',
  'ice': 'skills/ice-shield',
  'wind': 'skills/star-swirl',
  'earth': 'skills/shield-bounces',
  'light': 'buffs/holy-symbol',
  'dark': 'debuffs/skull-crossed-bones',
  'melee': 'skills/sword-clash',
  'slash': 'skills/quick-slash',
};

export function getEffectIcon(category: string): string {
  return EFFECT_ICON_MAP[category] || 'buffs/concentration-orb';
}

export function getItemIcon(itemType: string): string {
  return ITEM_ICON_MAP[itemType] || 'items/gem-pendant';
}

/**
 * 道具顯示的單一來源：優先讀 ItemDefinition 上的 icon / iconColor，
 * 其次是素材的 iconType / iconTier，最後才用名稱猜測。
 * 背包與商店共用此函式，避免兩邊各自實作而顯示不一致。
 */
export function resolveItemIcon(
  def: { icon?: string; iconColor?: string; iconType?: MaterialIconType; iconTier?: number } | undefined,
  fallbackKey: string,
): { icon: string; color?: string } {
  if (def?.icon) return { icon: def.icon, color: def.iconColor };
  if (def?.iconType) return { icon: getMaterialIcon(def.iconType), color: getMaterialColor(def.iconTier) };
  return { icon: getItemIcon(fallbackKey), color: undefined };
}

export function getEquipIcon(equipType: string): string {
  return EQUIP_ICON_MAP[equipType] || 'equipment/spinning-sword';
}

export function getSkillIcon(element: string): string {
  return SKILL_ICON_MAP[element] || 'skills/star-swirl';
}
