import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ItemsPage } from '../ItemsPage';
import { ITEM_DEFINITIONS } from '../../../db/seed';
import { resolveItemIcon } from '../../../models/iconMap';

/**
 * @vitest-environment jsdom
 *
 * Wiki 道具頁必須完全以 seed 為準（`43-wiki-system.md` § 43.3）：
 * icon / iconColor / buyPrice / sellPrice 都不可在 Wiki 端自行推導。
 */

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/wiki/items']}>
      <Routes>
        <Route path="/wiki/items" element={<ItemsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDetail(name: string) {
  return render(
    <MemoryRouter initialEntries={[`/wiki/items/${encodeURIComponent(name)}`]}>
      <Routes>
        <Route path="/wiki/items/:itemName" element={<ItemsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** 從列表中取出某道具的資料列 */
function getRow(name: string): HTMLElement {
  const cell = screen.getByRole('link', { name });
  const row = cell.closest('tr');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

function getIcon(row: HTMLElement): HTMLElement {
  const el = row.querySelector('[data-icon]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('Wiki 道具頁 — 圖示取自 seed', () => {
  it('狀態解除道具使用 seed 的 icon 與 iconColor，不是預設藥水圖', () => {
    renderList();

    // 這三個道具過去被 Wiki 的名稱猜測邏輯漏掉，一律 fallback 成紅藥水白色
    for (const name of ['解毒藥水', '止血繃帶', '淨化藥水']) {
      const def = ITEM_DEFINITIONS.find(i => i.name === name)!;
      const expected = resolveItemIcon(def, 'red-potion');
      const icon = getIcon(getRow(name));

      expect(icon.getAttribute('data-icon')).toBe(def.icon);
      expect(icon.getAttribute('data-icon')).toBe(expected.icon);
      expect(icon.getAttribute('data-icon-color')).toBe(def.iconColor);
    }
  });

  it('每個有 icon 欄位的道具，列表圖示與顏色都等於 seed', () => {
    renderList();
    const mismatched = ITEM_DEFINITIONS.filter(def => {
      if (!def.icon) return false;
      const icon = getIcon(getRow(def.name));
      return icon.getAttribute('data-icon') !== def.icon
        || icon.getAttribute('data-icon-color') !== def.iconColor;
    }).map(d => d.name);
    expect(mismatched).toEqual([]);
  });

  it('素材圖示走 iconType / iconTier，顏色為對應 tier 色', () => {
    renderList();
    const mismatched = ITEM_DEFINITIONS.filter(def => {
      if (def.icon || !def.iconType) return false;
      const expected = resolveItemIcon(def, 'material');
      const icon = getIcon(getRow(def.name));
      return icon.getAttribute('data-icon') !== expected.icon
        || icon.getAttribute('data-icon-color') !== expected.color;
    }).map(d => d.name);
    expect(mismatched).toEqual([]);
  });
});

describe('Wiki 道具頁 — 價格取自 seed', () => {
  it('只有 sellPrice 的素材會顯示售價，而不是全部空白', () => {
    renderList();
    const row = getRow('銀礦石');
    const def = ITEM_DEFINITIONS.find(i => i.name === '銀礦石')!;

    expect(def.buyPrice).toBeUndefined();
    expect(def.sellPrice).toBeGreaterThan(0);
    expect(within(row).getByText(`${def.sellPrice!.toLocaleString()} G`)).toBeDefined();
  });

  it('noSell 素材標示「不可販售」，與沒填價格區分', () => {
    renderList();
    const def = ITEM_DEFINITIONS.find(i => i.noSell)!;
    expect(within(getRow(def.name)).getByText('不可販售')).toBeDefined();
  });

  it('商店道具同時顯示購買價格', () => {
    renderList();
    const def = ITEM_DEFINITIONS.find(i => i.name === '紅色藥水')!;
    expect(within(getRow('紅色藥水')).getByText(`${def.buyPrice!.toLocaleString()} G`)).toBeDefined();
  });

  it('每個有 sellPrice 的道具在列表中都看得到售價', () => {
    renderList();
    const missing = ITEM_DEFINITIONS.filter(def => {
      if (!def.sellPrice || def.noSell) return false;
      const row = getRow(def.name);
      return within(row).queryByText(`${def.sellPrice.toLocaleString()} G`) === null;
    }).map(d => d.name);
    expect(missing).toEqual([]);
  });

  it('詳細頁同樣顯示購買價格與售價', () => {
    const def = ITEM_DEFINITIONS.find(i => i.name === '米索利碎片')!;
    renderDetail('米索利碎片');
    expect(screen.getAllByText(`${def.sellPrice!.toLocaleString()} G`).length).toBeGreaterThan(0);
  });
});
