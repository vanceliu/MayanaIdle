export type AffixCategory = 'weapon' | 'armor' | 'shield';

export type AffixType =
  | 'attack_power'
  | 'attack_elemental'
  | 'skill_elemental'
  | 'crit_rate'
  | 'crit_damage'
  | 'attack_speed'
  | 'cooldown_reduction'
  | 'defense'
  | 'max_hp'
  | 'max_mp'
  | 'heal_effect'
  | 'potion_effect'
  | 'drop_rate'
  | 'gold_rate'
  | 'block_rate';

export interface AffixTier {
  tier: number; // 1~7
  min: number;  // percentage
  max: number;  // percentage
}

export const AFFIX_TIERS: AffixTier[] = [
  { tier: 1, min: 5, max: 7 },
  { tier: 2, min: 8, max: 10 },
  { tier: 3, min: 11, max: 12 },
  { tier: 4, min: 13, max: 15 },
  { tier: 5, min: 16, max: 18 },
  { tier: 6, min: 19, max: 20 },
  { tier: 7, min: 21, max: 23 },
];

export interface AffixDefinition {
  type: AffixType;
  name: string;
  category: AffixCategory[];
}

export const AFFIX_DEFINITIONS: AffixDefinition[] = [
  // Weapon affixes (7)
  { type: 'attack_power', name: '攻擊力', category: ['weapon'] },
  { type: 'attack_elemental', name: '普攻元素傷害', category: ['weapon'] },
  { type: 'skill_elemental', name: '技能元素傷害', category: ['weapon'] },
  { type: 'crit_rate', name: '爆擊率', category: ['weapon'] },
  { type: 'crit_damage', name: '爆擊傷害', category: ['weapon'] },
  { type: 'attack_speed', name: '攻擊速度', category: ['weapon'] },
  { type: 'cooldown_reduction', name: '減少冷卻時間', category: ['weapon'] },
  // Armor affixes (7)
  { type: 'defense', name: '防禦力', category: ['armor', 'shield'] },
  { type: 'max_hp', name: '最大 HP', category: ['armor', 'shield'] },
  { type: 'max_mp', name: '最大 MP', category: ['armor', 'shield'] },
  { type: 'heal_effect', name: '補血效果', category: ['armor', 'shield'] },
  { type: 'potion_effect', name: '藥水效果', category: ['armor', 'shield'] },
  { type: 'drop_rate', name: '掉寶率', category: ['armor', 'shield'] },
  { type: 'gold_rate', name: '金幣獲得率', category: ['armor', 'shield'] },
  // Shield exclusive (1)
  { type: 'block_rate', name: '格擋率', category: ['shield'] },
];

export interface Affix {
  type: AffixType;
  tier: number;
  value: number; // rolled percentage value
}

export function getAffixPoolForSlot(category: AffixCategory): AffixDefinition[] {
  return AFFIX_DEFINITIONS.filter(d => d.category.includes(category));
}

export function rollAffixTier(areaLevel: number, isBoss: boolean = false): number {
  const weights = isBoss ? getBossTierWeights(areaLevel) : getTierWeights(areaLevel);
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i + 1;
  }
  return 1;
}

function getTierWeights(level: number): number[] {
  if (level <= 10) return [50, 30, 15, 4, 1, 0, 0];
  if (level <= 20) return [30, 35, 20, 10, 5, 0, 0];
  if (level <= 30) return [10, 25, 30, 20, 15, 0, 0];
  if (level <= 40) return [5, 10, 20, 30, 30, 5, 0];
  if (level <= 50) return [3, 7, 15, 25, 35, 15, 0];
  return [2, 5, 10, 20, 35, 28, 0];
}

function getBossTierWeights(level: number): number[] {
  if (level <= 20) return [10, 25, 30, 20, 15, 0, 0];
  if (level <= 30) return [5, 10, 20, 30, 25, 10, 0];
  if (level <= 40) return [3, 5, 15, 25, 30, 17, 5];
  if (level <= 50) return [2, 3, 10, 20, 30, 25, 10];
  return [1, 2, 5, 15, 30, 32, 15];
}

export function rollAffixValue(tier: number): number {
  const t = AFFIX_TIERS[tier - 1];
  return Math.floor(Math.random() * (t.max - t.min + 1)) + t.min;
}

export function generateAffixes(category: AffixCategory, areaLevel: number, slotCount: number = 4, isBoss: boolean = false): Affix[] {
  const pool = getAffixPoolForSlot(category);
  const available = [...pool];
  const affixes: Affix[] = [];

  const actualSlots = Math.min(slotCount, available.length);
  for (let i = 0; i < actualSlots; i++) {
    const idx = Math.floor(Math.random() * available.length);
    const def = available.splice(idx, 1)[0];
    const tier = rollAffixTier(areaLevel, isBoss);
    const value = rollAffixValue(tier);
    affixes.push({ type: def.type, tier, value });
  }

  return affixes;
}

export function getEffectiveAffixValue(affix: Affix, quality: number): number {
  return Math.floor(affix.value * (1 + quality / 100));
}

export interface AffixBonuses {
  attack_power: number;
  attack_elemental: number;
  skill_elemental: number;
  crit_rate: number;
  crit_damage: number;
  attack_speed: number;
  cooldown_reduction: number;
  defense: number;
  max_hp: number;
  max_mp: number;
  heal_effect: number;
  potion_effect: number;
  drop_rate: number;
  gold_rate: number;
  block_rate: number;
}

export function collectAffixBonuses(gear: { affixes?: Affix[]; quality?: number }[]): AffixBonuses {
  const bonuses: AffixBonuses = {
    attack_power: 0,
    attack_elemental: 0,
    skill_elemental: 0,
    crit_rate: 0,
    crit_damage: 0,
    attack_speed: 0,
    cooldown_reduction: 0,
    defense: 0,
    max_hp: 0,
    max_mp: 0,
    heal_effect: 0,
    potion_effect: 0,
    drop_rate: 0,
    gold_rate: 0,
    block_rate: 0,
  };

  for (const item of gear) {
    if (!item.affixes) continue;
    const quality = item.quality ?? 0;
    for (const affix of item.affixes) {
      bonuses[affix.type] += getEffectiveAffixValue(affix, quality);
    }
  }

  return bonuses;
}
