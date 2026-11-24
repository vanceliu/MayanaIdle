/**
 * @vitest-environment jsdom
 *
 * Wiki 鐵匠鋪頁一般／獨特製作切換（`43-wiki-system.md` § 4.7）與詳細頁返回連結（§ 4「詳細頁返回連結」）。
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { CraftingPage } from '../CraftingPage';
import { ItemsPage } from '../ItemsPage';
import { MonstersPage } from '../MonstersPage';
import { MapsPage } from '../MapsPage';
import { EQUIPMENT_SEEDS } from '../../../db/seed';
import { getItemById } from '../../../models/items';
import { UNIQUE_CRAFTED_GEAR_SUFFIX } from '../../../models/equipment';

const uniqueRecipe = EQUIPMENT_SEEDS.find(e => e.uniqueCraftMaterials?.length)!;

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{decodeURIComponent(pathname + search)}</output>;
}

function renderWiki(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/wiki/crafting" element={<CraftingPage />} />
        <Route path="/wiki/items" element={<p>道具總表</p>} />
        <Route path="/wiki/items/:itemName" element={<ItemsPage />} />
        <Route path="/wiki/monsters" element={<p>怪物列表</p>} />
        <Route path="/wiki/monsters/:monsterName" element={<MonstersPage />} />
        <Route path="/wiki/maps" element={<p>地圖總覽</p>} />
        <Route path="/wiki/maps/:areaId" element={<MapsPage />} />
        <Route path="/wiki/weapons/*" element={<p>武器頁</p>} />
        <Route path="/wiki/armor/*" element={<p>防具頁</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function rowOf(name: string): HTMLTableRowElement {
  const link = within(screen.getByRole('table')).getAllByRole('link', { name }).find(a => a.closest('td')?.cellIndex === 0);
  expect(link, name).toBeDefined();
  return link!.closest('tr') as HTMLTableRowElement;
}

function tierOptions(): string[] {
  return within(screen.getByRole('combobox')).getAllByRole('option').map(o => o.textContent ?? '');
}

describe('Wiki 鐵匠鋪 — 一般／獨特製作切換', () => {
  it('預設一般製作：材料欄為 craftMaterials', () => {
    renderWiki('/wiki/crafting');
    expect(screen.getByRole('tab', { name: '一般製作' }).getAttribute('aria-selected')).toBe('true');
    const row = rowOf(uniqueRecipe.name);
    for (const m of uniqueRecipe.craftMaterials!) {
      expect(row.textContent).toContain(`${getItemById(m.itemId)!.name}x${m.amount}`);
    }
  });

  it('獨特製作：成品標 (獨)、前置為裝備本身 ×1、材料欄為 uniqueCraftMaterials', () => {
    renderWiki('/wiki/crafting');
    fireEvent.click(screen.getByRole('tab', { name: '獨特製作' }));
    const row = rowOf(uniqueRecipe.name);
    expect(row.cells[0].textContent).toBe(`${uniqueRecipe.name} ${UNIQUE_CRAFTED_GEAR_SUFFIX}`);
    expect(row.cells[4].textContent).toBe(`${uniqueRecipe.name}×1`);
    for (const m of uniqueRecipe.uniqueCraftMaterials!) {
      expect(row.cells[5].textContent).toContain(`${getItemById(m.itemId)!.name}x${m.amount}`);
    }
    const listed = within(screen.getByRole('table')).getAllByRole('row').length - 1;
    expect(listed).toBe(EQUIPMENT_SEEDS.filter(e => e.uniqueCraftMaterials?.length).length);
  });

  it('階級篩選只列有配方的階級，兩種模式都沒有 Tier 7', () => {
    renderWiki('/wiki/crafting');
    const craftTiers = [...new Set(EQUIPMENT_SEEDS.filter(e => e.acquireType === 'craft').map(e => e.tier))];
    expect(tierOptions()).toHaveLength(craftTiers.length + 1);
    expect(tierOptions().some(t => t.includes('Tier 7'))).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: '獨特製作' }));
    expect(tierOptions().some(t => t.includes('Tier 7'))).toBe(false);
  });
});

describe('Wiki 詳細頁返回連結', () => {
  it('從鐵匠鋪點材料進道具頁：顯示返回上一頁，返回後保留獨特製作與篩選', () => {
    renderWiki('/wiki/crafting');
    fireEvent.click(screen.getByRole('tab', { name: '獨特製作' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: String(uniqueRecipe.tier) } });
    const material = getItemById(uniqueRecipe.uniqueCraftMaterials![0].itemId)!.name;
    fireEvent.click(within(rowOf(uniqueRecipe.name)).getByRole('link', { name: material }));

    expect(screen.getByTestId('location').textContent).toBe(`/wiki/items/${material}`);
    expect(screen.queryByRole('link', { name: /返回道具總表/ })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '← 返回上一頁' }));

    expect(screen.getByTestId('location').textContent).toBe(`/wiki/crafting?mode=unique&tier=${uniqueRecipe.tier}`);
    expect(screen.getByRole('tab', { name: '獨特製作' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(String(uniqueRecipe.tier));
  });

  it.each([
    ['道具', `/wiki/items/${getItemById(uniqueRecipe.uniqueCraftMaterials![0].itemId)!.name}`, '← 返回道具總表', '/wiki/items'],
    ['怪物', '/wiki/monsters/哥布林', '← 返回怪物列表', '/wiki/monsters'],
    ['地圖', '/wiki/maps/green-valley', '← 返回地圖總覽', '/wiki/maps'],
  ])('直接開啟%s詳細頁：顯示列表連結', (_label, path, linkName, listPath) => {
    renderWiki(path);
    expect(screen.queryByRole('link', { name: '← 返回上一頁' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: linkName }));
    expect(screen.getByTestId('location').textContent).toBe(listPath);
  });
});
