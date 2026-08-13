import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MonstersPage } from '../MonstersPage';
import { AFFIX_DROP_RATE, BOSS_DROP_MULTIPLIER } from '../../../models/talent';

/**
 * @vitest-environment jsdom
 */

const MONSTERS = [
  { id: 1, name: '史萊姆', level: 5, element: 'none', race: 'beast', size: 'small', isBoss: false, area: 'newbie-neutral' },
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

function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/wiki/monsters/%E5%8F%B2%E8%90%8A%E5%A7%86']}>
      <Routes>
        <Route path="/wiki/monsters/:monsterName" element={<MonstersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* 鑲材不走掉落表，怪物頁不列的話玩家查不到它從哪來（§ 51.6） */
describe('怪物頁的天賦鑲材掉落', () => {
  it('列出這個區域掉得到的鑲材階級與機率', () => {
    renderDetail();
    expect(screen.getByText(/天賦鑲材掉落/)).toBeDefined();
    // Lv.10 區域只掉 T1
    expect(screen.getByText('T1')).toBeDefined();
    expect(screen.getByText(`${AFFIX_DROP_RATE[1].toFixed(1)}%`)).toBeDefined();
  });

  it('一般怪的表格裡沒有天賦格那一列', () => {
    renderDetail();
    expect(screen.queryByText(/^天賦格 T/)).toBeNull();
  });

  it('掉率跟著常數走，不是寫死的', () => {
    renderDetail();
    const boss = (AFFIX_DROP_RATE[1] * BOSS_DROP_MULTIPLIER).toFixed(1);
    expect(screen.queryByText(`${boss}%`)).toBeNull();
  });
});
