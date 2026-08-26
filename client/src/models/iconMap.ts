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
  // 以下原本沒有 category 對應，一律落在通用的 concentration-orb，這裡給它們各自的圖示。
  // `agility-boost` / `strength-boost` / `holy-light` 三招沒有 buffCategory，
  // 效果的 category 會退回 skill.id（見 `gameStore.castSelfSkill`），所以用 id 當 key。
  'protect-shield': 'buffs/shield-echoes',
  'weapon-bless': 'buffs/sparkling-sabre',
  'invincible': 'buffs/bubble-field',
  'agility-boost': 'buffs/wingfoot',
  'strength-boost': 'buffs/muscle-up',
  'sanctuary': 'buffs/beams-aura',
  'holy-light': 'buffs/freedom-dove',

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

import type { IconGlow, MaterialIconType } from './items';

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
  'armGuard': 'equipment/bracer',
  'helmet': 'equipment/visored-helm',
  'chest': 'equipment/breastplate',
  'shirt': 'equipment/armor-vest',
  'cloak': 'equipment/cape-armor',
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

/**
 * 每一招攻擊／治癒技能的專屬圖示（`05-skill.md` § 技能圖示）。
 *
 * **buff 技能不在這張表裡** —— 它們沿用 buff bar 已經在用的
 * `getEffectIcon(buffCategory)`，技能面板、快捷格與狀態列因此是同一顆圖示。
 * 在這裡另外給 buff 一顆，等於同一個 buff 在兩個地方長不一樣。
 *
 * 素材全部來自 game-icons.net（CC BY 3.0），署名見 `assets/icons/CREDITS.md`；
 * 新增技能時要一併補這張表與素材檔，`skillIconCoverage.test.ts` 會擋下漏的。
 */
export const SKILL_ID_ICON_MAP: Record<string, string> = {
  // --- 基礎魔法 · 風 ---
  'wind-blade': 'skills/wind-slap',
  'thunder-strike': 'skills/lightning-slashes',
  'storm': 'skills/whirlwind',
  'gale-storm': 'skills/half-tornado',
  'tornado': 'skills/tornado',
  'chain-lightning': 'skills/lightning-arc',
  'divine-thunder': 'skills/thunder-struck',

  // --- 基礎魔法 · 火 ---
  'flame-arrow': 'skills/fire-ray',
  'fireball': 'skills/fireball',
  'inferno': 'skills/flame-spin',
  'hellfire': 'skills/burning-embers',
  'flame-pillar': 'skills/flame-tunnel',
  'meteor-shot': 'skills/fragmented-meteor',
  'purgatory': 'skills/burning-blobs',
  'meteor-shower': 'skills/burning-meteor',
  'apocalypse-flame': 'skills/bright-explosion',

  // --- 基礎魔法 · 冰 ---
  'ice-bolt': 'skills/frozen-orb',
  'frost': 'skills/snowflake-1',
  'ice-fog': 'skills/snowing',
  'ice-lance': 'skills/frozen-arrow',
  'ice-ring': 'skills/icicles-aura',
  'blizzard': 'skills/snowflake-2',
  'blizzard-storm': 'skills/icicles-fence',
  'absolute-zero': 'skills/frozen-block',

  // --- 基礎魔法 · 地 ---
  'rock-fall': 'skills/falling-boulder',
  'earth-rend': 'skills/earth-crack',
  'armor-break': 'skills/slashed-shield',
  'earth-shatter': 'skills/quake-stomp',

  // --- 基礎魔法 · 暗 ---
  'shadow-ball': 'skills/smoking-orb',
  'vampire-kiss': 'skills/marrow-drain',
  'curse': 'skills/cursed-star',
  'shadow-burst': 'skills/shadow-grasp',

  // --- 基礎魔法 · 光／無 ---
  'holy-bolt': 'skills/ringed-beam',
  'ultimate-ray': 'skills/explosion-rays',

  // --- 基礎魔法 · 治癒 ---
  'heal': 'skills/healing',
  'mid-heal': 'skills/healing-shield',
  'great-heal': 'skills/health-increase',
  'full-heal': 'skills/life-support',

  // --- 職業魔法 · 騎士 ---
  'shield-bash': 'skills/shield-bash',
  'rend': 'skills/serrated-slash',
  'taunt': 'skills/sonic-shout',
  'vengeance': 'skills/bloody-sword',

  // --- 職業魔法 · 妖精 ---
  'triple-shot': 'skills/arrow-cluster',
  'arrow-rain': 'skills/split-arrows',

  // --- 職業魔法 · 元素師 ---
  'mana-drain': 'skills/life-tap',
  'element-storm': 'skills/atomic-slashes',

  // --- 職業魔法 · 牧師 ---
  'holy-judgment': 'skills/sunbeams',
  'high-heal': 'skills/heart-plus',
  'group-heal': 'skills/prayer',

  // --- 職業魔法 · 盜賊 ---
  'backstab': 'skills/backstab',
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
  def: { icon?: string; iconColor?: string; iconType?: MaterialIconType; iconTier?: number; iconGlow?: IconGlow } | undefined,
  fallbackKey: string,
): { icon: string; color?: string; glowClass: string } {
  const glowClass = def?.iconGlow ? `item-icon-glow item-icon-glow--${def.iconGlow}` : '';
  if (def?.icon) return { icon: def.icon, color: def.iconColor, glowClass };
  if (def?.iconType) return { icon: getMaterialIcon(def.iconType), color: getMaterialColor(def.iconTier), glowClass };
  return { icon: getItemIcon(fallbackKey), color: undefined, glowClass };
}

export function getEquipIcon(equipType: string): string {
  return EQUIP_ICON_MAP[equipType] || 'equipment/spinning-sword';
}

export function getSkillIcon(element: string): string {
  return SKILL_ICON_MAP[element] || 'skills/star-swirl';
}

/**
 * 一招技能該顯示哪個圖示 —— 技能面板、快捷格、Wiki 共用這一支。
 *
 * 查找順序：
 * 1. **buff 技能** → `getEffectIcon(buffCategory)`，與 buff bar 同一顆
 * 2. `SKILL_ID_ICON_MAP` 的專屬圖示
 * 3. 依元素退回 `getSkillIcon()`
 *
 * 順序不可對調：buff 若先查專屬表，同一個 buff 會在狀態列與技能面板長不一樣。
 */
export function getSkillDisplayIcon(skill: {
  id: string;
  type?: string;
  element?: string;
  buffCategory?: string;
}): string {
  if (skill.type === 'buff') return getEffectIcon(skill.buffCategory ?? skill.id);
  return SKILL_ID_ICON_MAP[skill.id] ?? getSkillIcon(skill.element ?? 'none');
}

/**
 * 天賦鑲材的圖示（`51-auto-talent.md`）。key ＝ `ruleId`。
 *
 * 沒對到的用 `getTalentAffixIcon` 的 kind 預設 ——
 * 89 筆鑲材不必逐筆配圖，同一族（目標系、倉庫系…）共用一個就夠認。
 */
export const TALENT_AFFIX_ICON_MAP: Record<string, string> = {
  // 自身狀態
  hp_below: 'buffs/holy-grail',
  hp_above: 'buffs/holy-grail',
  hp_dropped_recently: 'debuffs/bleeding-wound',
  mp_below: 'items/potion-ball',
  mp_above: 'items/potion-ball',
  skill_ready: 'buffs/concentration-orb',
  buff_not_active: 'buffs/aura',
  speed_not_active: 'buffs/sprint',
  debuff_active: 'debuffs/poison-gas',
  self_shielded: 'buffs/magic-shield',
  buff_remaining_below: 'items/hourglass',
  potion_cooldown_ready: 'items/standing-potion',
  weight_over: 'items/swap-bag',
  weapon_type_is: 'buffs/sparkling-sabre',
  area_dwell_gte: 'items/hourglass',
  current_area_is: 'items/tied-scroll',

  // 場上與目標
  monster_count_gte: 'buffs/crosshair',
  monsters_near_self_gte: 'buffs/crosshair',
  aoe_hit_count_gte: 'skills/arrow-cluster',
  monster_hp_below: 'buffs/on-target',
  monster_hp_above: 'buffs/on-target',
  target_distance: 'buffs/on-target',
  target_attack_type: 'skills/arrow-cluster',
  target_race: 'debuffs/skull-crossed-bones',
  target_element: 'buffs/embrassed-energy',
  target_size: 'buffs/muscle-up',
  target_is_boss: 'debuffs/stoned-skull',
  target_defense: 'debuffs/broken-shield',
  target_level_diff: 'buffs/muscle-up',
  target_range_gt: 'buffs/flaming-arrow',
  target_has_debuff: 'debuffs/poison-gas',
  target_lacks_debuff: 'debuffs/poison-gas',
  target_cc_immune: 'debuffs/cracked-shield',
  target_shielded: 'buffs/shield-reflect',
  target_casting: 'skills/star-swirl',
  field_has_race: 'debuffs/skull-crossed-bones',
  field_avg_hp_below: 'buffs/crosshair',
  can_kill_target: 'buffs/deadly-strike',
  can_kill_count_gte: 'buffs/deadly-strike',

  // 補給條件
  in_town: 'items/tied-scroll',
  bag_slots_used_gte: 'items/swap-bag',
  bag_free_slots_lte: 'items/swap-bag',
  item_count_below: 'items/potion-ball',
  gold_below: 'items/cut-diamond',
  gold_above: 'items/cut-diamond',
  has_hunt_location: 'items/tied-scroll',
  warehouse_gold_gte: 'items/cut-diamond',
  warehouse_item_gte: 'items/swap-bag',

  // 戰鬥動作
  normal_attack: 'skills/bloody-sword',
  wait: 'items/hourglass',
  skill: 'buffs/sparkling-sabre',
  switch_target_lowest_hp: 'buffs/on-target',
  switch_target_highest_hp: 'buffs/on-target',
  switch_target_farthest: 'buffs/crosshair',
  switch_target_by_kind: 'buffs/crosshair',
  switch_target_by_debuff: 'debuffs/poison-gas',
  lock_target: 'buffs/on-target',
  keep_distance: 'buffs/wingfoot',
  close_in: 'buffs/run',

  // 常駐動作
  potion: 'items/standing-potion',
  heal_skill: 'buffs/holy-grail',
  buff_skill: 'buffs/aura',
  speed_potion: 'buffs/sprint',
  cure_item: 'items/bubbling-flask',
  use_town_scroll: 'items/scroll-unfurled',
  use_consumable: 'items/potion-ball',
  refill_to_percent: 'items/standing-potion',
  refill_all_buffs: 'buffs/beams-aura',

  // 補給動作
  return_town: 'items/scroll-unfurled',
  return_to_hunt: 'items/tied-scroll',
  use_inn: 'buffs/holy-grail',
  buy_item: 'items/cut-diamond',
  withdraw_item: 'items/swap-bag',
  sell_materials: 'items/clay-brick',
  sell_equipment: 'items/gem-pendant',
  deposit_materials: 'items/swap-bag',
  deposit_equipment: 'items/swap-bag',
  deposit_gold: 'items/cut-diamond',
  withdraw_gold: 'items/cut-diamond',
};

/** 對不到就用種類預設：條件＝準星、實作＝劍 */
export function getTalentAffixIcon(ruleId: string, kind: 'condition' | 'action'): string {
  return TALENT_AFFIX_ICON_MAP[ruleId]
    ?? (kind === 'condition' ? 'buffs/crosshair' : 'skills/bloody-sword');
}

/** 天賦格的圖示：tier 越高條件槽越多，用同一個符號帶 tier 標示 */
export const TALENT_SLOT_ICON = 'items/three-keys';
