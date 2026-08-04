// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquipmentDetail, EquipmentTemplateDetail } from '../EquipmentInfo';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

/** 腰帶實例：負重加成與背包格數並存（`35-inventory-constraints.md` § 35.1、§ 35.2.1） */
function beltInstance(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 593,
    name: '皮腰帶',
    type: 'armor',
    slot: 'belt',
    isTwoHanded: false,
    defense: 0,
    bonusWeight: 1700,
    bonusBagSlots: 5,
    weight: 10,
    quality: 0,
    enhancement: 0,
    stability: -1,
    affixes: [],
    ownerId: 1,
    equipped: false,
    ...overrides,
  };
}

function beltTemplate(overrides: Partial<EquipmentTemplate> = {}): EquipmentTemplate {
  return {
    id: 594,
    name: '鐵扣腰帶',
    type: 'armor',
    slot: 'belt',
    isTwoHanded: false,
    defense: 0,
    bonusWeight: 2500,
    bonusBagSlots: 6,
    weight: 12,
    buyPrice: 8000,
    stability: -1,
    ...overrides,
  };
}

describe('EquipmentDetail 負重加成顯示', () => {
  it('腰帶實例顯示負重加成，且排在背包格子之後', () => {
    const { container } = render(<EquipmentDetail item={beltInstance()} />);

    expect(screen.getByText('負重+1700')).toBeDefined();

    const stats = Array.from(container.querySelectorAll('.equip-detail-stat')).map(
      el => el.textContent,
    );
    expect(stats.indexOf('負重+1700')).toBe(stats.indexOf('背包格子+5') + 1);
  });

  it('負重加成與物品自身重量是兩個不同欄位', () => {
    render(<EquipmentDetail item={beltInstance()} />);
    expect(screen.getByText('負重+1700')).toBeDefined();
    expect(screen.getByText('重量: 10')).toBeDefined();
  });

  it('沒有 bonusWeight 的裝備不顯示負重欄', () => {
    const helmet = beltInstance({
      templateId: 1,
      name: '皮帽',
      slot: 'helmet',
      defense: 3,
      bonusWeight: undefined,
      bonusBagSlots: undefined,
    });
    render(<EquipmentDetail item={helmet} />);
    expect(screen.queryByText(/^負重\+/)).toBeNull();
  });
});

describe('EquipmentTemplateDetail 負重加成顯示', () => {
  it('商店的腰帶模板顯示負重加成', () => {
    const { container } = render(<EquipmentTemplateDetail template={beltTemplate()} />);

    expect(screen.getByText('負重+2500')).toBeDefined();

    const stats = Array.from(container.querySelectorAll('.equip-detail-stat')).map(
      el => el.textContent,
    );
    expect(stats.indexOf('負重+2500')).toBe(stats.indexOf('背包格子+6') + 1);
  });

  it('沒有 bonusWeight 的模板不顯示負重欄', () => {
    const boots = beltTemplate({
      id: 2,
      name: '皮靴',
      slot: 'boots',
      defense: 2,
      bonusWeight: undefined,
      bonusBagSlots: undefined,
    });
    render(<EquipmentTemplateDetail template={boots} />);
    expect(screen.queryByText(/^負重\+/)).toBeNull();
  });
});
