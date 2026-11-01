/**
 * 增益藥水（`30-items.md` § 30.4a）。
 */
import type { StatModifier } from './effect';

export type BuffPotionType = 'mp-regen' | 'crit' | 'hp-regen' | 'focus';

export interface BuffPotionConfig {
  itemId: number;
  /** buff category：四種各自獨立，同種再喝刷新時間 */
  category: string;
  modifier: StatModifier;
  /** buff 說明（BuffBar tooltip） */
  description: string;
}

export const BUFF_POTION_DURATION_MS = 300_000;

/** 所有 Boss 共通掉落，每種各自判定（`27-drop-table.md` § 27.6） */
export const BUFF_POTION_BOSS_DROP_VALUE = 30;

export const BUFF_POTION_CONFIG: Record<BuffPotionType, BuffPotionConfig> = {
  'mp-regen': {
    itemId: 173, category: 'mp-regen-potion',
    modifier: { stat: 'mp_regen', value: 15, isPercent: false }, description: '回魔量 +15',
  },
  crit: {
    itemId: 174, category: 'crit-potion',
    modifier: { stat: 'crit_rate', value: 10, isPercent: true }, description: '爆擊率 +10%',
  },
  'hp-regen': {
    itemId: 175, category: 'hp-regen-potion',
    modifier: { stat: 'hp_regen', value: 15, isPercent: false }, description: '回血量 +15',
  },
  focus: {
    itemId: 176, category: 'focus-potion',
    modifier: { stat: 'magic_attack', value: 8, isPercent: false }, description: '魔攻 +8',
  },
};

const BUFF_POTION_BY_ITEM_ID = new Map<number, BuffPotionType>(
  (Object.entries(BUFF_POTION_CONFIG) as [BuffPotionType, BuffPotionConfig][]).map(([type, c]) => [c.itemId, type]),
);

export function getBuffPotionType(itemId: number): BuffPotionType | undefined {
  return BUFF_POTION_BY_ITEM_ID.get(itemId);
}

export const BUFF_POTION_ITEM_IDS: readonly number[] = [...BUFF_POTION_BY_ITEM_ID.keys()];
