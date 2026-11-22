import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StartPage, RECOMMENDED_CLASS } from '../StartPage';
import { CLASS_NAMES_ZH } from '../../../models/character';
import { ZONES, getRegionsByZone } from '../../../models/mapData';
import { DEFAULT_EMERGENCY_RETREAT } from '../../../models/scriptEngine';
import { OFFLINE_GOLD_ENABLED, OFFLINE_GOLD_MIN_OFFLINE_MS } from '../../../systems/offlineGold';

/**
 * @vitest-environment jsdom
 *
 * Wiki 新手開始頁（`43-wiki-system.md` § 4.0）：章節目錄、推薦職業、表格取自 model。
 */
function renderPage() {
  return render(<MemoryRouter><StartPage /></MemoryRouter>);
}

describe('StartPage', () => {
  afterEach(cleanup);

  it('目錄每章一顆按鈕，且每章都有對應段落', () => {
    renderPage();
    const toc = screen.getByRole('navigation', { name: '章節目錄' });
    const buttons = within(toc).getAllByRole('button');
    expect(buttons).toHaveLength(10);
    for (const b of buttons) expect(screen.getByRole('heading', { name: b.textContent! })).toBeTruthy();
  });

  it('推薦職業為妖精並在職業表標示', () => {
    renderPage();
    expect(RECOMMENDED_CLASS).toBe('elf');
    expect(screen.getByText(`${CLASS_NAMES_ZH.elf}（推薦）`)).toBeTruthy();
  });

  it('新手區地圖與區域表取自地圖資料，不含城鎮', () => {
    renderPage();
    const regions = getRegionsByZone('newbie-neutral');
    for (const r of regions.filter(r => r.type !== 'town')) expect(screen.getByRole('link', { name: r.name })).toBeTruthy();
    for (const r of regions.filter(r => r.type === 'town')) expect(screen.queryByRole('link', { name: r.name })).toBeNull();
    for (const z of ZONES) expect(screen.getByText(z.name)).toBeTruthy();
  });

  it('預設保護的門檻取自預設天賦', () => {
    renderPage();
    expect(screen.getByText(new RegExp(`HP 低於 ${DEFAULT_EMERGENCY_RETREAT.hpThreshold}% 用回城卷軸`))).toBeTruthy();
    expect(screen.queryByText(/HP 低於 undefined%/)).toBeNull();
  });

  it('離線收益隨開關：開啟時強調只有金幣、門檻取自常數；關閉時寫明沒有離線收益', () => {
    renderPage();
    if (OFFLINE_GOLD_ENABLED) {
      expect(screen.getByText('只有金幣')).toBeTruthy();
      expect(screen.getByText(new RegExp(`離線滿 ${OFFLINE_GOLD_MIN_OFFLINE_MS / 60_000} 分鐘後上線`))).toBeTruthy();
      expect(screen.queryByText(/沒有離線收益/)).toBeNull();
    } else {
      expect(screen.queryByText('只有金幣')).toBeNull();
      expect(screen.queryByText(/離線滿 \d+ 分鐘後上線/)).toBeNull();
      expect(screen.getByText(/沒有離線收益/)).toBeTruthy();
    }
  });
});
