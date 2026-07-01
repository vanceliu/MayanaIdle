export type CraftTier = 'entry' | 'mid' | 'top';

export interface CraftMaterial {
  name: string;
  amount: number;
}

export interface CraftPrerequisiteWeapon {
  name: string;
  quantity: number;
}

export const CRAFT_TIER_NAMES: Record<CraftTier, string> = {
  entry: '高級入門',
  mid: '高級進階',
  top: '頂級',
};
