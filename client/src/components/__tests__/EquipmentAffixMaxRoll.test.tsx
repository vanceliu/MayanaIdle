// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquipmentDetail } from '../EquipmentInfo';
import type { EquipmentInstance } from '../../models/equipment';
import type { Affix } from '../../models/affix';

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

/** § 7.3.2 詞綴滾到該 Tier 上限時以粗體標示；特殊詞綴一律粗體 */
function instanceWithAffixes(affixes: Affix[], quality = 0): EquipmentInstance {
  return {
    templateId: 593,
    name: '皮腰帶',
    type: 'armor',
    slot: 'belt',
    isTwoHanded: false,
    defense: 10,
    weight: 10,
    quality,
    enhancement: 0,
    stability: -1,
    affixes,
    ownerId: 1,
    equipped: false,
  } as EquipmentInstance;
}

describe('EquipmentDetail 詞綴滿值標示', () => {
  it('marks max-roll affixes and leaves others unmarked', () => {
    render(
      <EquipmentDetail
        item={instanceWithAffixes([
          { type: 'max_hp', tier: 4, value: 11 },  // 防具池表 T4 = 10~11 → 滿值
          { type: 'defense', tier: 4, value: 10 }, // 同 Tier 非滿值
        ])}
      />,
    );

    const maxed = screen.getByText(/最大 HP \+11% \(T4\)/);
    expect(maxed.className).toContain('max-roll');
    const notMaxed = screen.getByText(/防禦力 \+10% \(T4\)/);
    expect(notMaxed.className).not.toContain('max-roll');
  });

  it('judges by the raw roll, not the quality-boosted display value', () => {
    render(
      <EquipmentDetail
        item={instanceWithAffixes([{ type: 'max_hp', tier: 4, value: 12 }], 20)}
      />,
    );

    // 品質 20% 讓顯示值變 14（超過 T4 上限 13），仍不算滿 roll
    const affix = screen.getByText(/最大 HP \+14% \(T4\)/);
    expect(affix.className).not.toContain('max-roll');
  });

  it('renders special affixes with the special class (bold by CSS), never max-roll', () => {
    render(
      <EquipmentDetail item={instanceWithAffixes([{ type: 'immune_poison', tier: 0, value: 0 }])} />,
    );

    const affix = screen.getByText(/\[特殊\] 毒免疫/);
    expect(affix.className).toContain('special');
    expect(affix.className).not.toContain('max-roll');
  });
});
