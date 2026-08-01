// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AffixesPage } from '../../wiki/pages/AffixesPage';
import { WikiHome } from '../../wiki/pages/WikiHome';
import {
  AFFIX_DEFINITIONS,
  SPECIAL_AFFIX_DEFINITIONS,
  getAffixPoolForSlot,
} from '../../models/affix';

const CATEGORY_COLUMNS = ['weapon', 'armor', 'shield', 'accessory'] as const;

describe('詞綴 wiki 頁', () => {
  it('列出所有一般詞綴與特殊詞綴', () => {
    render(<AffixesPage />);
    for (const def of AFFIX_DEFINITIONS) {
      expect(screen.getAllByText(def.name).length, def.name).toBeGreaterThan(0);
    }
    for (const def of SPECIAL_AFFIX_DEFINITIONS) {
      expect(screen.getAllByText(def.name).length, def.name).toBeGreaterThan(0);
    }
  });

  it('每個詞綴的適用部位與 AFFIX_DEFINITIONS 的分類一致', () => {
    const { container } = render(<AffixesPage />);
    const matrix = container.querySelector<HTMLElement>('.wiki-table')!;

    for (const def of AFFIX_DEFINITIONS) {
      const row = within(matrix).getByText(def.name).closest('tr')!;
      const cells = row.querySelectorAll('td');
      // 第 0 欄是詞綴名，之後依序為 武器／一般防具／盾牌／飾品
      CATEGORY_COLUMNS.forEach((cat, i) => {
        const expected = def.category.includes(cat) ? '✓' : '—';
        expect(cells[i + 1].textContent, `${def.name} / ${cat}`).toBe(expected);
      });
    }
  });

  it('可選詞綴數與 getAffixPoolForSlot 一致', () => {
    const { container } = render(<AffixesPage />);
    const row = container.querySelector('.wiki-table')!.querySelector('tbody tr:last-child')!;
    const cells = row.querySelectorAll('td');
    CATEGORY_COLUMNS.forEach((cat, i) => {
      expect(cells[i + 1].textContent, cat).toBe(`${getAffixPoolForSlot(cat).length} 種`);
    });
  });

  it('說明詛咒／虛弱／減速沒有免疫詞綴', () => {
    render(<AffixesPage />);
    expect(screen.getByText(/詛咒、虛弱、減速改由魔法抗性依機率抵抗/)).toBeTruthy();
    for (const name of ['詛咒免疫', '虛弱免疫', '減速免疫']) {
      expect(screen.queryByText(name), name).toBeNull();
    }
  });

  it('已登錄於 wiki 首頁導覽', () => {
    render(
      <MemoryRouter>
        <WikiHome />
      </MemoryRouter>
    );
    expect(screen.getByText('詞綴')).toBeTruthy();
  });
});
