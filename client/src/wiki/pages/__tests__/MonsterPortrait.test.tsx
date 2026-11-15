/**
 * Wiki 怪物詳細頁的正面圖（`25-monster-system.md` § 25.2.2「Wiki」）
 *
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MonstersPage } from '../MonstersPage';

const MONSTERS = [
  { id: 1, name: '暴牙兔', level: 1, element: 'none', race: 'normal', size: 'small', isBoss: false, area: 'newbie-neutral' },
  { id: 999, name: '無圖怪', level: 1, element: 'none', race: 'normal', size: 'small', isBoss: false, area: 'newbie-neutral' },
];

vi.mock('../../hooks/useWikiData', () => ({
  useMonsterList: () => MONSTERS,
  useDropTableByArea: () => [],
  useBossDropTableByName: () => [],
  useRegions: () => [{ id: 'newbie-neutral', name: '新手區', levelMax: 10, floors: undefined }],
  getAreaDisplayName: (a: string) => a,
  getDropRate: () => '0%',
  getDropItemName: () => '',
  getWikiEquipmentPath: () => '',
}));

const loadMonsterArt = vi.fn((key: string) => {
  void key;
  const front = document.createElement('canvas');
  front.width = 60;
  front.height = 128;
  return Promise.resolve({ front, side: front, back: front });
});
vi.mock('../../../pixi/entities/monster/monsterArtAssets', () => ({
  monsterArtKey: (id: number) => (id === 1 ? 'buck-rabbit' : null),
  loadMonsterArt: (key: string) => loadMonsterArt(key),
}));
vi.mock('../../../pixi/entities/monster/artOutline', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../pixi/entities/monster/artOutline')>()),
  bakeOutlinedCanvas: () => {
    const canvas = document.createElement('canvas');
    canvas.dataset.testid = 'portrait-canvas';
    return canvas;
  },
}));

function renderDetail(name: string) {
  render(
    <MemoryRouter initialEntries={[`/wiki/monsters/${encodeURIComponent(name)}`]}>
      <Routes>
        <Route path="/wiki/monsters/:monsterName" element={<MonstersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Wiki 怪物詳細頁正面圖', () => {
  it('有素材：載入該怪物的素材，正面圖放在標題旁', async () => {
    renderDetail('暴牙兔');
    const portrait = screen.getByTestId('monster-portrait');
    await waitFor(() => expect(portrait.querySelector('canvas')).not.toBeNull());
    expect(loadMonsterArt).toHaveBeenCalledWith('buck-rabbit');
    expect(portrait.parentElement!.querySelector('.wiki-page-title')!.textContent).toContain('暴牙兔');
  });

  it('沒有素材：不載入、不顯示圖', () => {
    loadMonsterArt.mockClear();
    renderDetail('無圖怪');
    expect(screen.getByTestId('monster-portrait').childElementCount).toBe(0);
    expect(loadMonsterArt).not.toHaveBeenCalled();
  });
});
