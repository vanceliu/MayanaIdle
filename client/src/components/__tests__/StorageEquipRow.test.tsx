// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Storage } from '../town/Storage';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../db/database', () => ({
  db: { equipmentInstances: { update: vi.fn() } },
}));

const AXE: EquipmentInstance = {
  id: 7,
  templateId: 1,
  name: '重型戰斧',
  type: 'axe',
  slot: 'rightHand',
  isTwoHanded: true,
  smallMonsterDamage: 8,
  largeMonsterDamage: 13,
  attackSuccess: 1,
  material: 'iron',
  weight: 70,
  quality: 0,
  enhancement: 3,
  stability: -1,
  affixes: [{ type: 'crit_rate', tier: 2, value: 7 }],
  ownerId: 1,
  equipped: false,
};

function setup(storedEquipment: EquipmentInstance[] = [], inventory: EquipmentInstance[] = []) {
  useGameStore.setState({
    bagItems: [],
    inventory,
    storedEquipment,
    storedMaterials: [],
    personalStoredEquipment: [],
    personalStoredMaterials: [],
    equippedGear: {},
    warehouseGold: 0,
  });
  render(<Storage />);
}

function equipRow(): HTMLElement {
  const row = Array.from(document.querySelectorAll('.storage-item'))
    .find(r => r.textContent?.includes(AXE.name));
  if (!row) throw new Error('找不到裝備列');
  return row as HTMLElement;
}

function hoverName() {
  fireEvent.mouseEnter(equipRow().querySelector('.tooltip-trigger')!);
  act(() => {
    vi.advanceTimersByTime(300);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('倉庫裝備列 — 一行名稱 + hover tooltip', () => {
  it('取出頁的裝備列只有 icon 與名稱（含強化），不展開數值與詞綴', () => {
    setup([AXE]);
    fireEvent.click(screen.getByRole('button', { name: '取出物品' }));

    const name = equipRow().querySelector('.storage-equip-name') as HTMLElement;
    expect(name.textContent).toBe('重型戰斧 +3');
    expect(name.querySelector('[data-testid^="icon-"]')).not.toBeNull();
    expect(equipRow().querySelector('.equip-detail')).toBeNull();
    expect(equipRow().textContent).not.toContain('材質');
  });

  it('hover 名稱後 tooltip 顯示完整裝備資訊', () => {
    setup([AXE]);
    fireEvent.click(screen.getByRole('button', { name: '取出物品' }));
    hoverName();

    const popup = document.querySelector('.tooltip-popup') as HTMLElement;
    expect(popup).not.toBeNull();
    expect(popup.querySelector('.equip-detail')).not.toBeNull();
    expect(popup.textContent).toContain('材質');
    expect(popup.textContent).toContain('爆擊率');
  });

  it('存入頁的背包裝備列同樣只有一行', () => {
    setup([], [AXE]);

    expect(equipRow().querySelector('.storage-equip-name')?.textContent).toBe('重型戰斧 +3');
    expect(equipRow().querySelector('.equip-detail')).toBeNull();
  });
});
