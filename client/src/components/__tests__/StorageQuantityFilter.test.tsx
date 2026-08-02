// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Storage } from '../town/Storage';
import { useGameStore } from '../../stores/gameStore';
import type { BagItem } from '../../stores/gameStore';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../db/database', () => ({
  db: { equipmentInstances: { update: vi.fn() } },
}));

const BAG: BagItem[] = [
  { name: '紅色藥水', type: 'potion', amount: 30 },
  { name: '橙色藥水', type: 'potion', amount: 5 },
  { name: '品質石', type: 'material', amount: 1200 },
];

function setup(bagItems: BagItem[] = BAG, storedMaterials: BagItem[] = []) {
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
  vi.spyOn(useGameStore.getState(), 'saveState').mockImplementation(() => {});
  render(<Storage />);
}

function row(itemName: string): HTMLElement {
  const rows = Array.from(document.querySelectorAll('.storage-item')) as HTMLElement[];
  const found = rows.find(r => r.textContent?.includes(itemName));
  if (!found) throw new Error(`找不到物品列: ${itemName}`);
  return found;
}

function qtyInput(itemName: string): HTMLInputElement {
  return within(row(itemName)).getByLabelText(`${itemName} 數量`) as HTMLInputElement;
}

function clickIn(itemName: string, name: RegExp | string) {
  fireEvent.click(within(row(itemName)).getByRole('button', { name }));
}

/** 目前畫面上實際列出的物品列文字（不含空清單提示） */
function visibleRows(): string[] {
  return Array.from(document.querySelectorAll('.storage-item')).map(r => r.textContent ?? '');
}

function hasRow(itemName: string): boolean {
  return visibleRows().some(t => t.includes(itemName));
}

function openWithdrawTab() {
  fireEvent.click(screen.getByRole('button', { name: '取出物品' }));
}

function searchBox(): HTMLInputElement {
  return screen.getByLabelText('搜尋物品名稱') as HTMLInputElement;
}

beforeEach(() => {
  useGameStore.setState({ bagItems: [], inventory: [], storedMaterials: [] });
});

describe('倉庫存入 — 數量步進器', () => {
  it('可打字輸入數量後存入，背包與倉庫數量正確', () => {
    setup();
    fireEvent.change(qtyInput('紅色藥水'), { target: { value: '12' } });
    clickIn('紅色藥水', '存入');

    const state = useGameStore.getState();
    expect(state.bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(18);
    expect(state.storedMaterials.find(s => s.name === '紅色藥水')?.amount).toBe(12);
  });

  it('數量上限為背包持有量', () => {
    setup();
    const input = qtyInput('橙色藥水');
    fireEvent.change(input, { target: { value: '999' } });
    expect(input.value).toBe('5');
  });

  it('倉庫不套用 999 硬上限，可一次存入超過 999 的素材', () => {
    setup();
    const input = qtyInput('品質石');
    fireEvent.change(input, { target: { value: '1200' } });
    expect(input.value).toBe('1200');

    clickIn('品質石', '存入');
    expect(useGameStore.getState().storedMaterials.find(s => s.name === '品質石')?.amount).toBe(1200);
  });

  it('＋10 / −10 按鈕會調整數量', () => {
    setup();
    const input = qtyInput('紅色藥水');
    clickIn('紅色藥水', '紅色藥水 增加十個');
    expect(input.value).toBe('11');
    clickIn('紅色藥水', '紅色藥水 減少十個');
    expect(input.value).toBe('1');
  });

  it('「全部」按鈕仍可一次存光', () => {
    setup();
    clickIn('橙色藥水', '全部');
    expect(useGameStore.getState().bagItems.find(b => b.name === '橙色藥水')).toBeUndefined();
    expect(useGameStore.getState().storedMaterials.find(s => s.name === '橙色藥水')?.amount).toBe(5);
  });
});

describe('倉庫取出 — 數量步進器', () => {
  it('可指定數量取出', () => {
    setup([], [{ name: '紅色藥水', type: 'potion', amount: 20 }]);
    openWithdrawTab();

    fireEvent.change(qtyInput('紅色藥水'), { target: { value: '7' } });
    clickIn('紅色藥水', '取出');

    const state = useGameStore.getState();
    expect(state.storedMaterials.find(s => s.name === '紅色藥水')?.amount).toBe(13);
    expect(state.bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(7);
  });
});

describe('倉庫 — 名稱搜尋', () => {
  it('輸入關鍵字後只留下符合的物品', () => {
    setup();
    fireEvent.change(searchBox(), { target: { value: '藥水' } });

    expect(hasRow('紅色藥水')).toBe(true);
    expect(hasRow('橙色藥水')).toBe(true);
    expect(hasRow('品質石')).toBe(false);
  });

  it('沒有符合項目時顯示提示訊息', () => {
    setup();
    fireEvent.change(searchBox(), { target: { value: '不存在的東西' } });
    expect(screen.getAllByText(/沒有符合「不存在的東西」的項目/).length).toBeGreaterThan(0);
  });

  it('搜尋忽略前後空白', () => {
    setup();
    fireEvent.change(searchBox(), { target: { value: '  品質石  ' } });
    expect(hasRow('品質石')).toBe(true);
    expect(hasRow('紅色藥水')).toBe(false);
  });

  it('清除按鈕會還原完整清單', () => {
    setup();
    fireEvent.change(searchBox(), { target: { value: '品質石' } });
    expect(hasRow('紅色藥水')).toBe(false);

    fireEvent.click(screen.getByLabelText('清除搜尋'));
    expect(searchBox().value).toBe('');
    expect(hasRow('紅色藥水')).toBe(true);
  });

  it('搜尋條件同時套用在取出頁', () => {
    setup([], [
      { name: '紅色藥水', type: 'potion', amount: 3 },
      { name: '品質石', type: 'material', amount: 3 },
    ]);
    openWithdrawTab();
    fireEvent.change(searchBox(), { target: { value: '品質' } });

    expect(hasRow('品質石')).toBe(true);
    expect(hasRow('紅色藥水')).toBe(false);
  });
});
