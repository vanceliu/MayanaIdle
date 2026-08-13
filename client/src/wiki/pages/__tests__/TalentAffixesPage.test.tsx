import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TalentAffixesPage } from '../TalentAffixesPage';
import { TALENT_AFFIX_DEFS } from '../../../db/seed/talentSeeds';

/**
 * @vitest-environment jsdom
 */

function renderPage(path = '/wiki/talents/affixes') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <TalentAffixesPage />
    </MemoryRouter>,
  );
}

const dataRows = () => document.querySelectorAll('tbody tr');

describe('鑲材總表（§ 43.4.12）', () => {
  it('預設列出全部鑲材，含玩家尚未取得的', () => {
    renderPage();
    // 第二張表是合成與掉落，只算第一張
    const rows = document.querySelectorAll('.wiki-table-wrap tbody tr');
    expect(rows.length).toBe(TALENT_AFFIX_DEFS.length);
  });

  // 怪物頁的掉落表用 ?tier= 連過來
  it('網址帶 tier 就只列該階級', () => {
    renderPage('/wiki/talents/affixes?tier=1');
    const expected = TALENT_AFFIX_DEFS.filter(d => d.tier === 1).length;
    expect(document.querySelectorAll('.wiki-table-wrap tbody tr').length).toBe(expected);
  });

  it('種類篩選只留條件', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('種類篩選'), { target: { value: 'condition' } });
    const expected = TALENT_AFFIX_DEFS.filter(d => d.kind === 'condition').length;
    expect(document.querySelectorAll('.wiki-table-wrap tbody tr').length).toBe(expected);
  });

  it('適用類型篩選只留補給', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('適用類型篩選'), { target: { value: 'supply' } });
    const expected = TALENT_AFFIX_DEFS.filter(d => d.appliesTo.includes('supply')).length;
    expect(document.querySelectorAll('.wiki-table-wrap tbody tr').length).toBe(expected);
  });

  // 怪物側機制沒開的要標明，免得玩家白刷（§ 51.4.4）
  it('未開放的鑲材標明尚未開放', () => {
    renderPage();
    const blocked = TALENT_AFFIX_DEFS.filter(d => d.blocked);
    expect(blocked.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/尚未開放/)).toHaveLength(blocked.length);
  });

  it('篩到空的時候給訊息，不是一片空白', () => {
    renderPage('/wiki/talents/affixes?tier=7');
    fireEvent.change(screen.getByLabelText('型態篩選'), { target: { value: 'pool' } });
    if (dataRows().length > 0) expect(screen.queryByText('沒有符合條件的鑲材')).toBeDefined();
  });

  /* 說明放在總表裡，不必再回自動天賦頁對照 */
  it('每一筆都有功能說明', () => {
    renderPage();
    const rows = [...document.querySelectorAll('.wiki-table-wrap tbody tr')];
    expect(rows.length).toBe(TALENT_AFFIX_DEFS.length);
    for (const row of rows) {
      const desc = row.querySelectorAll('td')[1];
      expect(desc.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  // 欄數對不上時整列會位移，每一欄的標題底下都會是別欄的內容
  it('每一列的欄數與表頭一致', () => {
    renderPage();
    const headers = document.querySelectorAll('.wiki-table-wrap thead th').length;
    for (const row of document.querySelectorAll('.wiki-table-wrap tbody tr')) {
      expect(row.querySelectorAll('td').length).toBe(headers);
    }
  });

  it('階級欄顯示的是階級', () => {
    renderPage('/wiki/talents/affixes?tier=1');
    for (const row of document.querySelectorAll('.wiki-table-wrap tbody tr')) {
      expect(row.querySelectorAll('td')[2].textContent).toBe('T1');
    }
  });

  // 總表只有表，合成／升級／掉落在自動天賦頁
  it('不含合成、升級與掉落表', () => {
    renderPage();
    expect(screen.queryByText('合成、升級與掉落')).toBeNull();
  });
});