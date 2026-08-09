import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScriptsPage } from '../ScriptsPage';
import {
  COMBAT_CONDITION_LABELS,
  COMBAT_ACTION_LABELS,
  PERSISTENT_CONDITION_LABELS,
  PERSISTENT_ACTION_LABELS,
} from '../../../models/scriptEngine';
import { VILLAGE_CONDITION_LABELS, VILLAGE_ACTION_LABELS } from '../../../models/villageScript';

/**
 * @vitest-environment jsdom
 *
 * Wiki 腳本頁的條件／動作名稱必須來自 models 的標籤常數（`43-wiki-system.md` § 43.3）。
 * 這組測試守的是「面板上有的選項，Wiki 一定查得到」——
 * 之後新增條件卻忘了寫說明時，這裡會紅。
 */

const ALL_LABELS = [
  COMBAT_CONDITION_LABELS,
  COMBAT_ACTION_LABELS,
  PERSISTENT_CONDITION_LABELS,
  PERSISTENT_ACTION_LABELS,
  VILLAGE_CONDITION_LABELS,
  VILLAGE_ACTION_LABELS,
];

describe('Wiki 自動腳本頁', () => {
  it('每一個條件與動作都列得出來', () => {
    render(<ScriptsPage />);
    for (const labels of ALL_LABELS) {
      for (const label of Object.values(labels)) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
    }
  });

  it('每一列都有說明，不會只有名稱', () => {
    render(<ScriptsPage />);
    const rows = screen.getAllByRole('row');
    // 表頭列不算；資料列的第二欄必須有字
    const dataRows = rows.filter(r => r.querySelectorAll('td').length === 2);
    expect(dataRows.length).toBeGreaterThan(0);
    for (const row of dataRows) {
      const desc = row.querySelectorAll('td')[1];
      expect(desc.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('三套腳本的判定時機都寫在頁面上', () => {
    render(<ScriptsPage />);
    expect(screen.getByText('戰鬥腳本', { selector: 'h3' })).toBeDefined();
    expect(screen.getByText('常駐腳本', { selector: 'h3' })).toBeDefined();
    expect(screen.getByText('村莊腳本', { selector: 'h3' })).toBeDefined();
    expect(screen.getByText(/每 300ms/)).toBeDefined();
    expect(screen.getByText(/每 1000ms/)).toBeDefined();
  });

  it('點出「沒有攻擊規則就不出手」這個容易踩的雷', () => {
    render(<ScriptsPage />);
    expect(screen.getByText(/完全不出手/)).toBeDefined();
  });
});
