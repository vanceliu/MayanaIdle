// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AffixesPage } from '../../wiki/pages/AffixesPage';
import { WikiHome } from '../../wiki/pages/WikiHome';
import {
  AFFIX_CATEGORIES,
  AFFIX_DEFINITIONS,
  AFFIX_POOLS,
  AFFIX_TIER_TABLES,
  SHARED_AFFIX_TYPES,
  SPECIAL_AFFIX_DEFINITIONS,
  formatAffixBound,
  formatAffixTierSpan,
  getAffixPoolForSlot,
  getAffixTierTable,
  isAttributeAffixType,
  isFlatAffixType,
  type AffixCategory,
} from '../../models/affix';
import {
  CHAOS_SIGIL_BONUS_TIER,
  CHAOS_SIGIL_T6_ANY_RATE,
  CHAOS_SIGIL_T6_MIN_LEVEL,
  CHAOS_SIGIL_T6_RATE,
  SIGIL_EXCHANGE_FEE_COUNT,
  SIGIL_EXCHANGE_INPUT_COUNT,
} from '../../models/sigil';

/** 〈詞綴一覽〉目前分頁裡的資料列；名稱取第一欄的第一個文字節點（後面可能接「共用」標籤） */
function listRows(): HTMLElement[] {
  return Array.from(screen.getByTestId('affix-list').querySelectorAll<HTMLElement>('tbody tr'));
}

function nameOf(row: HTMLElement): string {
  return row.querySelector('td')?.childNodes[0]?.textContent ?? '';
}

function rowFor(name: string): HTMLElement | undefined {
  return listRows().find(r => nameOf(r) === name && r.classList.contains('affix-cat-row'));
}

const openTab = (category: AffixCategory) =>
  fireEvent.click(screen.getByRole('tab', { name: AFFIX_CATEGORIES.find(c => c.key === category)!.name }));

describe('詞綴 wiki 頁', () => {
  it('分頁依序為各分類加總覽，預設武器', () => {
    render(<AffixesPage />);
    const tabs = screen.getAllByRole('tab').map(t => t.textContent);
    expect(tabs).toEqual([...AFFIX_CATEGORIES.map(c => c.name), '總覽']);
    expect(screen.getByRole('tab', { name: '武器' }).getAttribute('aria-selected')).toBe('true');
  });

  it('每個分類分頁列出該分類的詞綴池、效果與 T1~T7 區間，共用詞綴標「共用」', () => {
    render(<AffixesPage />);
    for (const c of AFFIX_CATEGORIES) {
      openTab(c.key);
      const rows = listRows().filter(r => r.classList.contains('affix-cat-row'));
      const pool = getAffixPoolForSlot(c.key);
      // 依 § 7.4 分組顯示，組內照定義順序
      const groups = [...new Set(AFFIX_DEFINITIONS.map(d => d.group))];
      const expected = groups.flatMap(g => pool.filter(d => d.group === g));
      expect(rows.map(nameOf), c.key).toEqual(expected.map(d => d.name));
      for (const def of expected) {
        const cells = [...rowFor(def.name)!.querySelectorAll('td')].map(td => td.textContent ?? '');
        expect(cells[1], `${c.key} ${def.name} 效果`).toBe(def.description);
        const range = isAttributeAffixType(def.type) ? '固定 +1 · 無 Tier' : formatAffixTierSpan(def.type, c.key);
        expect(cells[2], `${c.key} ${def.name} 區間`).toBe(range);
        const shared = c.key !== 'weapon' && SHARED_AFFIX_TYPES.includes(def.type);
        expect(!!rowFor(def.name)!.querySelector('.affix-cat-shared'), `${c.key} ${def.name} 共用`).toBe(shared);
      }
      expect(screen.getByTestId('affix-list').textContent).toContain(`一般詞綴 ${pool.length} 種`);
    }
  });

  it('點詞綴列展開該分類的 T1~T7 各階數值', () => {
    render(<AffixesPage />);
    openTab('gloves');
    fireEvent.click(rowFor('爆擊率')!);
    const chips = [...screen.getByTestId('affix-list').querySelectorAll('.affix-cat-tiers .affix-tag')].map(e => e.textContent);
    const table = getAffixTierTable('crit_rate', 'gloves');
    expect(chips).toEqual(table.map(t => `T${t.tier} ${formatAffixBound('crit_rate', t.min)}~${formatAffixBound('crit_rate', t.max)}%`));
  });

  it('免疫詞綴表只出現在上衣·斗篷與腰帶，列出最低掉落區域等級', () => {
    render(<AffixesPage />);
    for (const c of AFFIX_CATEGORIES) {
      openTab(c.key);
      for (const def of SPECIAL_AFFIX_DEFINITIONS) {
        const row = listRows().find(r => r.querySelector('.affix-tag.special')?.textContent === def.name);
        expect(!!row, `${c.key} ${def.name}`).toBe(def.category.includes(c.key));
        if (row) expect(row.textContent).toContain(`Lv.${def.minAreaLevel}+`);
      }
    }
  });

  it('總覽矩陣：格內為 T7 上限，種類數列與詞綴池一致，點欄位標題切到該分類', () => {
    render(<AffixesPage />);
    fireEvent.click(screen.getByRole('tab', { name: '總覽' }));
    const rows = listRows();
    for (const def of AFFIX_DEFINITIONS) {
      const row = rows.find(r => r.querySelector('td')?.textContent === def.name)!;
      const cells = [...row.querySelectorAll('td')].slice(1).map(td => td.textContent);
      AFFIX_CATEGORIES.forEach((c, i) => {
        const expected = !(def.type in AFFIX_POOLS[c.key])
          ? '—'
          : isAttributeAffixType(def.type)
            ? '+1'
            : `${formatAffixBound(def.type, getAffixTierTable(def.type, c.key)[6].max)}${isFlatAffixType(def.type) ? '' : '%'}`;
        expect(cells[i], `${def.name} / ${c.key}`).toBe(expected);
      });
    }
    const countRow = rows.find(r => r.querySelector('td')?.textContent === '種類數')!;
    expect([...countRow.querySelectorAll('td')].slice(1).map(td => td.textContent))
      .toEqual(AFFIX_CATEGORIES.map(c => String(getAffixPoolForSlot(c.key).length)));

    fireEvent.click(screen.getByRole('columnheader', { name: '手套' }));
    expect(screen.getByRole('tab', { name: '手套' }).getAttribute('aria-selected')).toBe('true');
  });

  it('階級數值表每張表一列、T1~T7 七欄，不放表名欄', () => {
    const { container } = render(<AffixesPage />);
    const rows = container.querySelectorAll('#affix-tiers tbody tr');
    const keys = Object.keys(AFFIX_TIER_TABLES) as (keyof typeof AFFIX_TIER_TABLES)[];
    expect(rows.length).toBe(keys.length);
    expect(container.querySelectorAll('#affix-tiers thead th').length).toBe(7);
    keys.forEach((key, i) => {
      const cells = [...rows[i].querySelectorAll('td')].map(td => td.textContent);
      const percent = !['N2', 'N4', 'evasion', 'hpMp', 'hpMpWeapon'].includes(key);
      expect(cells, key).toEqual(AFFIX_TIER_TABLES[key].map(t =>
        percent ? `${t.min.toFixed(1)}~${t.max.toFixed(1)}%` : `${t.min}~${t.max}`));
    });
  });

  it('說明詛咒／虛弱／減速／沉默沒有免疫詞綴', () => {
    render(<AffixesPage />);
    expect(screen.getByText(/詛咒、虛弱、減速、沉默改由魔法抗性依機率抵抗/)).toBeTruthy();
    for (const name of ['詛咒免疫', '虛弱免疫', '減速免疫']) {
      expect(screen.queryByText(name), name).toBeNull();
    }
  });

  it('印記節說明混沌／新增的 T6 機率（引用實作常數）', () => {
    const { container } = render(<AffixesPage />);
    const text = container.textContent ?? '';
    const pct = `${(CHAOS_SIGIL_T6_RATE * 100).toFixed(2)}% 為 T${CHAOS_SIGIL_BONUS_TIER}`;
    expect(text).toContain(pct);
    expect(text).toContain(`至少 1 條 T${CHAOS_SIGIL_BONUS_TIER} 的機率為 ${CHAOS_SIGIL_T6_ANY_RATE * 100}%`);
    expect(text).toContain(`T${CHAOS_SIGIL_BONUS_TIER} 需角色 Lv.${CHAOS_SIGIL_T6_MIN_LEVEL} 以上`);
  });

  it('印記節說明印記兌換的數量（引用實作常數）', () => {
    const { container } = render(<AffixesPage />);
    const text = container.textContent ?? '';
    expect(text).toContain('印記兌換');
    expect(text).toContain(`任意混搭 ${SIGIL_EXCHANGE_INPUT_COUNT} 個`);
    expect(text).toContain(`合計 ${SIGIL_EXCHANGE_FEE_COUNT} 個`);
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
