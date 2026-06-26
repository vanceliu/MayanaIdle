export type CraftTier = 'entry' | 'mid' | 'top';

export interface CraftMaterial {
  name: string;
  amount: number;
}

export const CRAFT_TIER_NAMES: Record<CraftTier, string> = {
  entry: '高階入門',
  mid: '高階中段',
  top: '頂級',
};
