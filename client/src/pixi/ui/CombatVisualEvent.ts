export type DamageType = 'normal' | 'crit' | 'element' | 'skill' | 'dot' | 'heal' | 'miss';

export interface CombatVisualEvent {
  targetScreenX: number;
  targetScreenY: number;
  value: number;
  damageType: DamageType;
}

export const DAMAGE_COLORS: Record<DamageType, number> = {
  normal: 0xffffff,
  crit: 0xffff00,
  element: 0x44ccff,
  skill: 0xcccccc,
  dot: 0xff88cc,
  heal: 0x44ff44,
  miss: 0x999999,
};
