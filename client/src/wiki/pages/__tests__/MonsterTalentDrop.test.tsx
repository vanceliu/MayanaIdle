import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MonstersPage } from '../MonstersPage';
import { SLOT_DROP_RATE_BOSS, SLOT_DROP_RATE_UNIQUE } from '../../../models/talent';
import { UNIQUE_MARK_COLOR } from '../../monsterRankMark';

/**
 * @vitest-environment jsdom
 */

const MONSTERS = [
  { id: 1, name: '史萊姆', level: 5, element: 'none', race: 'beast', size: 'small', isBoss: false, area: 'newbie-neutral' },
  { id: 2, name: '巨魔王', level: 35, element: 'none', race: 'humanoid', size: 'large', isBoss: true, area: 'mid-neutral' },
  { id: 3, name: '冰牙狼王', level: 33, element: 'ice', race: 'normal', size: 'large', isBoss: false, isUnique: true, spawnMode: 'every10min', spawnGroup: 'mid-neutral', area: 'mid-neutral' },
];

const UNIQUE_DROPS = [
  { bossName: '冰牙狼王', itemType: 'item', itemTemplateId: 192, dropValue: 100, minAmount: 1, maxAmount: 1 },
];

vi.mock('../../hooks/useWikiData', () => ({
  useMonsterList: () => MONSTERS,
  useDropTableByArea: () => [],
  useBossDropTableByName: (name: string) => (name === '冰牙狼王' ? UNIQUE_DROPS : []),
  useRegions: () => [
    { id: 'newbie-neutral', name: '新手區', levelMax: 10, floors: undefined },
    { id: 'mid-neutral', name: '中階區', levelMax: 40, floors: undefined },
  ],
  getAreaDisplayName: (a: string) => a,
  getDropRate: () => '0%',
  getAreaDropRateText: () => '0%',
  formatRatePercent: (rate: number) => `${rate * 100}%`,
  getDropItemName: (d: { itemTemplateId?: number }) => (d.itemTemplateId === 192 ? '冰牙狼王之牙' : ''),
  getWikiEquipmentPath: () => '',
}));

function renderList() {
  render(
    <MemoryRouter initialEntries={['/wiki/monsters']}>
      <Routes>
        <Route path="/wiki/monsters" element={<MonstersPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

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
const UNIQUE = encodeURIComponent('冰牙狼王');

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

/* 獨特魔物（`25-monster-system.md` § 25.13；Wiki § 4.3） */
describe('怪物頁的獨特魔物', () => {
  afterEach(cleanup);

  it('列表與 Boss 同一欄標「獨特」', () => {
    renderList();
    const row = screen.getByRole('link', { name: '冰牙狼王' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('獨特')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Boss／獨特' })).toBeDefined();
  });

  it('詳細頁標題標「獨特」，用獨特魔物卡片的名稱色', () => {
    renderDetail(UNIQUE);
    const mark = screen.getByRole('heading', { level: 2 }).querySelector('span') as HTMLElement;
    expect(mark.textContent).toBe('獨特');
    expect(mark.style.color).toBe(hexToRgb(UNIQUE_MARK_COLOR));
    expect(screen.queryByText(/★ Boss/)).toBeNull();
  });

  it('掉落只列自己的專屬掉落表', () => {
    renderDetail(UNIQUE);
    expect(screen.getByText('獨特魔物專屬掉落')).toBeDefined();
    expect(screen.getByText('冰牙狼王之牙')).toBeDefined();
    expect(screen.queryByText('Boss 專屬掉落')).toBeNull();
  });

  it('技能書與天賦格用獨特魔物的掉率', () => {
    renderDetail(UNIQUE);
    expect(screen.getByText(/職業技能書掉落（獨特魔物 基礎 0\.25%）/)).toBeDefined();
    expect(screen.getByText(/天賦格掉落/)).toBeDefined();
    expect(screen.getByText(`${SLOT_DROP_RATE_UNIQUE}%`)).toBeDefined();
  });

  it('不標個別出現方式', () => {
    renderDetail(UNIQUE);
    expect(screen.queryByText(/every10min|random|halfHourGroup|10 分鐘|半小時/)).toBeNull();
  });
});

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
