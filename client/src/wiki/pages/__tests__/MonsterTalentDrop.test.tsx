import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MonstersPage } from '../MonstersPage';
import { SLOT_DROP_RATE_BOSS } from '../../../models/talent';

/**
 * @vitest-environment jsdom
 */

const MONSTERS = [
  { id: 1, name: '史萊姆', level: 5, element: 'none', race: 'beast', size: 'small', isBoss: false, area: 'newbie-neutral' },
  { id: 2, name: '巨魔王', level: 35, element: 'none', race: 'humanoid', size: 'large', isBoss: true, area: 'mid-neutral' },
];

vi.mock('../../hooks/useWikiData', () => ({
  useMonsterList: () => MONSTERS,
  useDropTableByArea: () => [],
  useBossDropTableByName: () => [],
  useRegions: () => [
    { id: 'newbie-neutral', name: '新手區', levelMax: 10, floors: undefined },
    { id: 'mid-neutral', name: '中階區', levelMax: 40, floors: undefined },
  ],
  getAreaDisplayName: (a: string) => a,
  getDropRate: () => '0%',
  getDropItemName: () => '',
  getWikiEquipmentPath: () => '',
}));

function renderDetail(encodedName: string) {
  render(
    <MemoryRouter initialEntries={[`/wiki/monsters/${encodedName}`]}>
      <Routes>
        <Route path="/wiki/monsters/:monsterName" element={<MonstersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const SLIME = encodeURIComponent('史萊姆');
const BOSS = encodeURIComponent('巨魔王');

/* 天賦格不走掉落表，怪物頁不列的話玩家查不到它從哪來（§ 51.6） */
describe('怪物頁的天賦格掉落', () => {
  it('Boss 列出這個區域掉得到的階級與機率', () => {
    renderDetail(BOSS);
    expect(screen.getByText(/天賦格掉落/)).toBeDefined();
    // Lv.40 區域只掉 T2
    expect(screen.getByText('T2')).toBeDefined();
    expect(screen.getByText(`${SLOT_DROP_RATE_BOSS}%`)).toBeDefined();
  });

  it('一般怪完全沒有這一段 —— 天賦格只有 Boss 會掉', () => {
    renderDetail(SLIME);
    expect(screen.queryByText(/天賦格掉落/)).toBeNull();
  });

  it('不列鑲材掉落 —— 條件與動作一律內建', () => {
    renderDetail(BOSS);
    expect(screen.queryByText(/鑲材/)).toBeNull();
  });
});
