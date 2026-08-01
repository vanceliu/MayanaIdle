// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CreditsPage } from '../../wiki/pages/CreditsPage';
import { ASSET_CREDITS } from '../../wiki/data/assetCredits';
import { WikiHome } from '../../wiki/pages/WikiHome';
import { MemoryRouter } from 'react-router-dom';

describe('CreditsPage', () => {
  it('每筆素材都列出用途、作者、授權與版庫路徑', () => {
    render(<CreditsPage />);

    for (const credit of ASSET_CREDITS) {
      expect(screen.getByText(credit.usage)).toBeTruthy();
      expect(screen.getAllByText(credit.authors).length).toBeGreaterThan(0);
      expect(screen.getAllByText(credit.license).length).toBeGreaterThan(0);
      if (credit.path) expect(screen.getByText(credit.path)).toBeTruthy();
    }
  });

  it('每一筆都有版庫路徑——此頁只列還在使用的素材，不列候選', () => {
    expect(ASSET_CREDITS.length).toBeGreaterThan(0);
    for (const credit of ASSET_CREDITS) {
      expect(credit.path, credit.name).toBeTruthy();
    }
  });

  it('等距地形素材已整批移除，不應再出現在此頁', () => {
    const names = ASSET_CREDITS.map(c => c.name);
    for (const removed of ['Isometric Stone Soup', 'Dungeon Crawl 32x32 tiles',
                           'Isometric Road Tiles', '[LPC] Rocks']) {
      expect(names).not.toContain(removed);
    }
  });

  it('每一筆都必須列出作者與授權，這是 CC BY 的硬性要求', () => {
    for (const credit of ASSET_CREDITS) {
      expect(credit.authors.trim().length, credit.name).toBeGreaterThan(0);
      expect(credit.license.trim().length, credit.name).toBeGreaterThan(0);
    }
  });

  it('來源與授權都是可點擊且在新分頁開啟的外部連結', () => {
    render(<CreditsPage />);

    for (const credit of ASSET_CREDITS) {
      const sourceLinks = screen.getAllByRole('link', { name: credit.sourceUrl });
      expect(sourceLinks.length).toBeGreaterThan(0);
      expect(sourceLinks[0].getAttribute('href')).toBe(credit.sourceUrl);
      // 外開連結必須帶 noopener，避免 window.opener 被反向操作
      expect(sourceLinks[0].getAttribute('target')).toBe('_blank');
      expect(sourceLinks[0].getAttribute('rel')).toContain('noopener');

      const licenseLink = screen.getAllByRole('link', { name: credit.license })[0];
      expect(licenseLink.getAttribute('href')).toBe(credit.licenseUrl);
    }
  });

  it('所有 URL 皆為 https，且授權連結指向對應的 Creative Commons 條款', () => {
    for (const credit of ASSET_CREDITS) {
      expect(credit.sourceUrl.startsWith('https://')).toBe(true);
      expect(credit.licenseUrl.startsWith('https://creativecommons.org/')).toBe(true);
    }
  });

  it('呈現 CC BY 3.0 要求的 game-icons.net 標注文字', () => {
    render(<CreditsPage />);
    expect(
      screen.getByText(/Icons made by Lorc & Delapouite\. Available on https:\/\/game-icons\.net/),
    ).toBeTruthy();
  });

  it('版庫中每個 assets 子目錄都有對應的標注（避免漏標）', () => {
    const paths = ASSET_CREDITS.filter(c => c.path).map(c => c.path);
    expect(paths).toContain('client/src/assets/icons/');
    // 已匯入的素材目前只剩圖示；地形素材移除後不應再有殘留標注
    expect(paths).toHaveLength(1);
  });

  it('Wiki 首頁有素材來源的分類卡片', () => {
    render(
      <MemoryRouter>
        <WikiHome />
      </MemoryRouter>,
    );
    const card = screen.getByText('素材來源').closest('div');
    expect(card).toBeTruthy();
    expect(within(card as HTMLElement).getByText(/第三方素材/)).toBeTruthy();
  });
});
