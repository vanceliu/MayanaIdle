// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Storage } from '../town/Storage';
import { useGameStore } from '../../stores/gameStore';
import type { BagItem } from '../../stores/gameStore';
import { bagItem } from '../../testing/bagFixtures';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../db/database', () => ({
  db: { equipmentInstances: { update: vi.fn() } },
}));

const ITEMS: BagItem[] = [
  bagItem('紅色藥水', 5),
  bagItem('銀礦石', 8),
  bagItem('工藝印記', 30),
  bagItem('混沌印記', 2),
];

function setup(bagItems: BagItem[], storedMaterials: BagItem[]) {
  useGameStore.setState({
    bagItems,
    inventory: [],
    storedEquipment: [],
    storedMaterials,
    personalStoredEquipment: [],
    personalStoredMaterials: [],
    equippedGear: {},
    warehouseGold: 0,
  });
  render(<Storage />);
}

/** 標題（h4）到下一個標題之間的物品列文字 */
function sectionRows(title: string): string[] {
  const heading = screen.getByRole('heading', { name: title });
  const rows: string[] = [];
  for (let el = heading.nextElementSibling; el && el.tagName !== 'H4'; el = el.nextElementSibling) {
    if (el.classList.contains('storage-item')) rows.push(el.textContent ?? '');
  }
  return rows;
}

function sectionText(title: string): string {
  const heading = screen.getByRole('heading', { name: title });
  const parts: string[] = [];
  for (let el = heading.nextElementSibling; el && el.tagName !== 'H4'; el = el.nextElementSibling) {
    parts.push(el.textContent ?? '');
  }
  return parts.join('');
}

function headings(): string[] {
  return screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent ?? '');
}

describe('倉庫存取 — 印記獨立一區', () => {
  it('存入頁：印記只出現在「背包印記」，材料區不含印記', () => {
    setup(ITEMS, []);

    const materials = sectionRows('背包材料');
    const sigils = sectionRows('背包印記');
    expect(materials).toHaveLength(1);
    expect(materials[0]).toContain('銀礦石');
    expect(sigils).toHaveLength(2);
    expect(sigils.some(t => t.includes('工藝印記'))).toBe(true);
    expect(sigils.some(t => t.includes('混沌印記'))).toBe(true);
    expect(headings().slice(-2)).toEqual(['背包材料', '背包印記']);
  });

  it('取出頁：印記只出現在「倉庫印記」，排在材料之後', () => {
    setup([], ITEMS);
    fireEvent.click(screen.getByRole('button', { name: '取出物品' }));

    const materials = sectionRows('倉庫材料');
    const sigils = sectionRows('倉庫印記');
    expect(materials).toHaveLength(1);
    expect(materials[0]).toContain('銀礦石');
    expect(sigils).toHaveLength(2);
    expect(headings().slice(-2)).toEqual(['倉庫材料', '倉庫印記']);
  });

  it('沒有印記時印記區顯示空清單提示', () => {
    setup([bagItem('銀礦石', 1)], []);
    expect(sectionText('背包印記')).toBe('無印記可存入');

    fireEvent.click(screen.getByRole('button', { name: '取出物品' }));
    expect(sectionText('倉庫印記')).toBe('無印記');
  });
});
