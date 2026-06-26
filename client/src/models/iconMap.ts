export const EFFECT_ICON_MAP: Record<string, string> = {
  // Buffs (category → icon path)
  'accuracy': 'buffs/on-target',
  'fire-enchant': 'buffs/flaming-arrow',
  'defense-buff': 'buffs/shield-reflect',
  'speed': 'buffs/sprint',
  'crit-buff': 'buffs/crosshair',
  'cd-reduction': 'buffs/lightning-helix',
  'element-boost': 'buffs/embrassed-energy',
  'chain-cast': 'buffs/concentration-orb',
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
};

export const ITEM_ICON_MAP: Record<string, string> = {
  'red-potion': 'items/standing-potion',
  'orange-potion': 'items/bubbling-flask',
  'white-potion': 'items/potion-ball',
  'scroll': 'items/scroll-unfurled',
  'town-scroll': 'items/tied-scroll',
  'spellbook': 'items/spell-book',
  'stone': 'items/cut-diamond',
  'whetstone': 'items/clay-brick',
  'material': 'items/cut-diamond',
  'key': 'items/three-keys',
};

export const EQUIP_ICON_MAP: Record<string, string> = {
  'sword': 'equipment/spinning-sword',
  'dagger': 'equipment/plain-dagger',
  'axe': 'equipment/battle-axe',
  'mace': 'equipment/battle-axe',
  'twoHandSword': 'equipment/spinning-sword',
  'twoHandAxe': 'equipment/battle-axe',
  'twoHandStaff': 'equipment/wizard-staff',
  'dualBlade': 'equipment/plain-dagger',
  'claw': 'equipment/plain-dagger',
  'bow': 'equipment/spinning-sword',
  'staff': 'equipment/wizard-staff',
  'shield': 'equipment/edged-shield',
  'magicBook': 'equipment/wizard-staff',
  'helmet': 'equipment/visored-helm',
  'chest': 'equipment/breastplate',
  'belt': 'equipment/armor-vest',
  'gloves': 'equipment/gloves',
  'boots': 'equipment/boots',
  'necklace': 'items/gem-pendant',
  'ring': 'items/gem-pendant',
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

export function getEquipIcon(equipType: string): string {
  return EQUIP_ICON_MAP[equipType] || 'equipment/spinning-sword';
}

export function getSkillIcon(element: string): string {
  return SKILL_ICON_MAP[element] || 'skills/star-swirl';
}
