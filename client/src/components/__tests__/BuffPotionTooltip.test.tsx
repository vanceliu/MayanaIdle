/**
 * 增益藥水的背包 tooltip 顯示道具說明（`30-items.md` § 30.4a）。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BagItemTooltipBody } from '../BagCell';
import { BUFF_POTION_CONFIG, type BuffPotionType } from '../../models/buffPotion';
import { getItemById } from '../../models/items';

describe('增益藥水 tooltip', () => {
  it.each(Object.keys(BUFF_POTION_CONFIG) as BuffPotionType[])('%s 顯示效果與時間', type => {
    const def = getItemById(BUFF_POTION_CONFIG[type].itemId)!;
    render(
      <BagItemTooltipBody
        item={{ id: 'p', type: 'potion', name: def.name, itemId: def.id, count: 2, buffPotionType: type }}
        templates={[]}
      />,
    );
    expect(screen.getByText(def.description!)).toBeTruthy();
  });
});
