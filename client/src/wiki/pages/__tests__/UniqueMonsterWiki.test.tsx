import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MapsPage } from '../MapsPage';
import { ItemsPage } from '../ItemsPage';
import { MONSTER_SEEDS } from '../../../db/seed';
import { UNIQUE_MONSTER_DROPS } from '../../../db/seed/dropSeeds';
import { getItemById } from '../../../models/items';
import { UNIQUE_SPAWN_NOTE } from '../../monsterRankMark';
import { formatRatePercent } from '../../hooks/useWikiData';
import { ALL_CLASS_SKILL_BOOKS, SKILL_BOOK_DROP_RATE } from '../../../systems/classSkillBookDrop';

/**
 * @vitest-environment jsdom
 *
 * 獨特魔物在地圖頁與道具頁的呈現（`43-wiki-system.md` § 4.4、§ 4.5；`25-monster-system.md` § 25.13）
 */

function renderMap(areaId: string) {
  return render(
    <MemoryRouter initialEntries={[`/wiki/maps/${areaId}`]}>
      <Routes>
        <Route path="/wiki/maps/:areaId" element={<MapsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderItem(name: string) {
  return render(
    <MemoryRouter initialEntries={[`/wiki/items/${encodeURIComponent(name)}`]}>
      <Routes>
        <Route path="/wiki/items/:itemName" element={<ItemsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const SPAWN_DETAIL = /random|every10min|halfHourGroup|10 分鐘|半小時/;

describe('地圖頁的獨特魔物', () => {
  it('單一區域：列出獨特魔物、標「獨特」，附通用說明一行', () => {
    renderMap('snow-field');
    const row = screen.getByRole('link', { name: '冰牙狼王' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('獨特')).toBeDefined();
    expect(screen.getAllByText(UNIQUE_SPAWN_NOTE)).toHaveLength(1);
    expect(screen.queryByText(SPAWN_DETAIL)).toBeNull();
  });

  it('多樓層地圖：有獨特魔物的樓層各附一行說明', () => {
    renderMap('ivory-tower');
    const floorsWithUnique = new Set(MONSTER_SEEDS.filter(m => m.isUnique && m.area.startsWith('ivory-tower-')).map(m => m.area));
    expect(floorsWithUnique.size).toBeGreaterThan(0);
    expect(screen.getAllByText(UNIQUE_SPAWN_NOTE)).toHaveLength(floorsWithUnique.size);
    expect(screen.queryByText(SPAWN_DETAIL)).toBeNull();
  });

  it('沒有獨特魔物的地圖不出現說明', () => {
    const area = MONSTER_SEEDS.find(m => !MONSTER_SEEDS.some(u => u.isUnique && u.area === m.area) && !/-\d+f$/.test(m.area))!.area;
    renderMap(area);
    expect(screen.queryByText(UNIQUE_SPAWN_NOTE)).toBeNull();
  });
});

describe('道具頁的獨特材料', () => {
  it.each(UNIQUE_MONSTER_DROPS.map(d => [getItemById(d.materialItemId)!.name, d.monster]))('%s 列出來源獨特魔物、10% 掉率與獨特配方用途', (material, monster) => {
    renderItem(material);
    const row = screen.getByRole('cell', { name: `${monster}（獨特魔物）` }).closest('tr') as HTMLElement;
    expect(within(row).getAllByRole('cell')[1].textContent).toBe('10.0%');
    expect(screen.getAllByText(/獨特配方/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/無掉落資料/)).toBeNull();
  });

  it('職業技能書列出同區域獨特魔物的掉率（`23-class-magic.md` § 23.1）', () => {
    const book = ALL_CLASS_SKILL_BOOKS.find(b => b.level === 3)!;
    renderItem(getItemById(book.itemId)!.name);
    const uniqueRows = screen.getAllByRole('link', { name: /（獨特魔物）$/ }).map(a => a.closest('tr') as HTMLElement);
    expect(uniqueRows.length).toBeGreaterThan(0);
    for (const row of uniqueRows) expect(within(row).getAllByRole('cell')[1].textContent).toBe(`基礎 ${formatRatePercent(SKILL_BOOK_DROP_RATE.unique)}`);
  });
});
