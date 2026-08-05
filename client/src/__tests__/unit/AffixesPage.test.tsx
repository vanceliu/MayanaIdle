// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AffixesPage } from '../../wiki/pages/AffixesPage';
import { WikiHome } from '../../wiki/pages/WikiHome';
import {
  AFFIX_DEFINITIONS,
  AFFIX_TIERS,
  SPECIAL_AFFIX_DEFINITIONS,
  getAffixPoolForSlot,
  getAffixTierTable,
  type AffixCategory,
} from '../../models/affix';

const CATEGORY_LABELS: Record<AffixCategory, string> = {
  weapon: '武器',
  armor: '一般防具',
  shield: '盾牌',
  accessory: '飾品',
};

/** 取得「第一欄為該詞綴名」的資料列（階級表的第一欄是 T1~T7，不會誤中） */
function rowsFor(name: string): HTMLElement[] {
  return screen
    .getAllByRole('row')
    .filter(r => r.querySelector('td')?.textContent === name);
}

function cellsOf(name: string): string[] {
  const row = rowsFor(name)[0];
  return Array.from(row.querySelectorAll('td')).map(td => td.textContent ?? '');
}

describe('詞綴 wiki 頁', () => {
  it('列出所有一般詞綴與特殊詞綴，且每條只出現一次', () => {
    render(<AffixesPage />);
    for (const def of [...AFFIX_DEFINITIONS, ...SPECIAL_AFFIX_DEFINITIONS]) {
      expect(rowsFor(def.name).length, def.name).toBe(1);
    }
  });

  it('每條詞綴列出適用部位、效果敘述與數值區間', () => {
    render(<AffixesPage />);
    for (const def of AFFIX_DEFINITIONS) {
      const [, categories, description, range] = cellsOf(def.name);
      expect(categories, `${def.name} 部位`).toBe(
        def.category.map(c => CATEGORY_LABELS[c]).join('、')
      );
      expect(description, `${def.name} 效果`).toBe(def.description);

      const tiers = getAffixTierTable(def.type);
      expect(range, `${def.name} 區間`).toBe(`${tiers[0].min}% ~ ${tiers[tiers.length - 1].max}%`);
    }
  });

  it('特殊詞綴列出效果與最低掉落區域等級', () => {
    render(<AffixesPage />);
    for (const def of SPECIAL_AFFIX_DEFINITIONS) {
      const [, categories, description, range] = cellsOf(def.name);
      expect(categories, `${def.name} 部位`).toBe(
        def.category.map(c => CATEGORY_LABELS[c]).join('、')
      );
      expect(description, `${def.name} 效果`).toBe(def.description);
      expect(range, `${def.name} 取得`).toContain(`Lv.${def.minAreaLevel}+`);
    }
  });

  it('依適用部位篩選後只留下該部位可帶的詞綴', () => {
    render(<AffixesPage />);
    const listed = () => AFFIX_DEFINITIONS.filter(d => rowsFor(d.name).length > 0).map(d => d.type);

    expect(listed()).toEqual(AFFIX_DEFINITIONS.map(d => d.type));

    for (const cat of ['weapon', 'armor', 'shield', 'accessory'] as AffixCategory[]) {
      fireEvent.change(screen.getByLabelText('適用部位篩選'), { target: { value: cat } });
      expect(listed(), cat).toEqual(getAffixPoolForSlot(cat).map(d => d.type));
      expect(screen.getByText(`${CATEGORY_LABELS[cat]}可選 ${getAffixPoolForSlot(cat).length} 種一般詞綴`)).toBeTruthy();
      // 武器不會出現特殊詞綴（免疫類只上防具／盾牌／飾品）
      for (const s of SPECIAL_AFFIX_DEFINITIONS) {
        expect(rowsFor(s.name).length > 0, `${cat} / ${s.name}`).toBe(s.category.includes(cat));
      }
    }
  });

  it('階級數值表列出通用區間、魔抗專屬區間與取得方式', () => {
    const { container } = render(<AffixesPage />);
    const rows = container.querySelectorAll('#affix-tiers tbody tr');
    expect(rows.length).toBe(AFFIX_TIERS.length);

    AFFIX_TIERS.forEach((t, i) => {
      const cells = rows[i].querySelectorAll('td');
      expect(cells[0].textContent).toBe(`T${t.tier}`);
      expect(cells[1].textContent).toBe(`${t.min}~${t.max}%`);
      const mr = getAffixTierTable('magic_resist')[i];
      expect(cells[2].textContent, `T${t.tier} 魔抗`).toBe(`${mr.min}~${mr.max}%`);
    });
    // T6/T7 只能靠掉落取得
    expect(rows[5].querySelectorAll('td')[3].textContent).toBe('怪物掉落');
    expect(rows[6].querySelectorAll('td')[3].textContent).toBe('Boss 限定掉落');
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
