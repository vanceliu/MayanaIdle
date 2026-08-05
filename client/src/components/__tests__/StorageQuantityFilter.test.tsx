// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Storage } from '../town/Storage';
import { useGameStore, BAG_BASE_SLOTS } from '../../stores/gameStore';
import { useTownStore } from '../../stores/townStore';
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

function setQty(itemName: string, value: string) {
  fireEvent.change(qtyInput(itemName), { target: { value } });
}

/** 底部動作列（全視窗唯一的存入／取出鈕） */
function footer(): HTMLElement {
  const el = document.querySelector('.shop-cart-footer');
  if (!el) throw new Error('找不到底部動作列');
  return el as HTMLElement;
}

function runCart() {
  fireEvent.click(within(footer()).getByRole('button'));
}

function footerText(selector: string): string {
  return footer().querySelector(selector)?.textContent ?? '';
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

describe('倉庫存入 — 購物車與底部執行鈕', () => {
  it('預設數量為 0，沒選任何東西時執行鈕 disabled', () => {
    setup();
    expect(qtyInput('紅色藥水').value).toBe('0');
    expect(footerText('.shop-cart-summary')).toBe('未選擇任何項目');
    expect((within(footer()).getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('物品列上沒有各自的存入鈕，動作只有底部那一顆', () => {
    setup();
    expect(within(row('紅色藥水')).queryAllByRole('button', { name: '存入' })).toHaveLength(0);
    expect(within(footer()).getByRole('button').textContent).toBe('存入');
  });

  it('可打字輸入數量後存入，背包與倉庫數量正確', () => {
    setup();
    setQty('紅色藥水', '12');
    runCart();

    const state = useGameStore.getState();
    expect(state.bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(18);
    expect(state.storedMaterials.find(s => s.name === '紅色藥水')?.amount).toBe(12);
  });

  it('多品項可一次存入', () => {
    setup();
    setQty('紅色藥水', '10');
    setQty('品質石', '200');
    expect(footerText('.shop-cart-summary')).toBe('已選 物品 2 種 · 共 210 個');
    runCart();

    const state = useGameStore.getState();
    expect(state.storedMaterials.find(s => s.name === '紅色藥水')?.amount).toBe(10);
    expect(state.storedMaterials.find(s => s.name === '品質石')?.amount).toBe(200);
    expect(state.bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(20);
    expect(state.bagItems.find(b => b.name === '品質石')?.amount).toBe(1000);
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

    runCart();
    expect(useGameStore.getState().storedMaterials.find(s => s.name === '品質石')?.amount).toBe(1200);
  });

  it('＋10 / −10 按鈕會調整數量', () => {
    setup();
    const input = qtyInput('紅色藥水');
    clickIn('紅色藥水', '紅色藥水 增加十個');
    expect(input.value).toBe('10');
    clickIn('紅色藥水', '紅色藥水 減少十個');
    expect(input.value).toBe('0');
  });

  it('存入後自動關閉設施視窗', () => {
    useTownStore.setState({ facility: 'storage' });
    setup();
    setQty('紅色藥水', '1');
    runCart();

    expect(useTownStore.getState().facility).toBe('list');
  });

  it('「全部」只把數量拉到持有量，存入仍由底部按鈕執行', () => {
    setup();
    clickIn('橙色藥水', '橙色藥水 全部');
    expect(qtyInput('橙色藥水').value).toBe('5');
    expect(useGameStore.getState().bagItems.find(b => b.name === '橙色藥水')?.amount).toBe(5);

    runCart();
    expect(useGameStore.getState().bagItems.find(b => b.name === '橙色藥水')).toBeUndefined();
    expect(useGameStore.getState().storedMaterials.find(s => s.name === '橙色藥水')?.amount).toBe(5);
  });
});

describe('倉庫取出 — 購物車與底部執行鈕', () => {
  it('可指定數量取出', () => {
    setup([], [{ name: '紅色藥水', type: 'potion', amount: 20 }]);
    openWithdrawTab();

    setQty('紅色藥水', '7');
    expect(within(footer()).getByRole('button').textContent).toBe('取出');
    runCart();

    const state = useGameStore.getState();
    expect(state.storedMaterials.find(s => s.name === '紅色藥水')?.amount).toBe(13);
    expect(state.bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(7);
  });

  it('背包欄位不足時擋下並說明原因', () => {
    const full = Array.from({ length: BAG_BASE_SLOTS }, (_, i) => ({
      name: `雜物${i}`, type: 'material' as const, amount: 1,
    }));
    setup(full, [{ name: '紅色藥水', type: 'potion', amount: 20 }]);
    openWithdrawTab();

    setQty('紅色藥水', '5');
    expect(footerText('.shop-cart-hint')).toBe('背包欄位不足');
    expect((within(footer()).getByRole('button') as HTMLButtonElement).disabled).toBe(true);

    runCart();
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')).toBeUndefined();
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
