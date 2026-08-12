import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TALENT_AFFIX_DEFS } from '../../../db/seed/talentSeeds';
import { TalentsPage, TalentAffixTable, TalentFusionTable } from '../TalentsPage';
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

describe('Wiki 自動天賦頁', () => {
  it('每一個條件與動作都列得出來', () => {
    render(<TalentsPage />);
    for (const labels of ALL_LABELS) {
      for (const label of Object.values(labels)) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
    }
  });

  it('每一列都有說明，不會只有名稱', () => {
    render(<TalentsPage />);
    const rows = screen.getAllByRole('row');
    // 表頭列不算；資料列的第二欄必須有字
    const dataRows = rows.filter(r => r.querySelectorAll('td').length === 2);
    expect(dataRows.length).toBeGreaterThan(0);
    for (const row of dataRows) {
      const desc = row.querySelectorAll('td')[1];
      expect(desc.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('三種天賦的判定時機都寫在頁面上', () => {
    render(<TalentsPage />);
    expect(screen.getByText('戰鬥天賦', { selector: 'h3' })).toBeDefined();
    expect(screen.getByText('常駐天賦', { selector: 'h3' })).toBeDefined();
    expect(screen.getByText('補給天賦', { selector: 'h3' })).toBeDefined();
    expect(screen.getByText(/每 300ms/)).toBeDefined();
    expect(screen.getByText(/每 1000ms/)).toBeDefined();
  });

  it('點出「沒有攻擊規則就不出手」這個容易踩的雷', () => {
    render(<TalentsPage />);
    expect(screen.getByText(/完全不出手/)).toBeDefined();
  });
});

describe('鑲材總表（§ 43.4.12）', () => {
  it('列出全部 89 筆鑲材 —— 含玩家尚未取得的', () => {
    render(<TalentAffixTable />);
    // 編輯器只顯示已持有的，「還有什麼可以刷」只有 Wiki 回答得了
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(TALENT_AFFIX_DEFS.length);
  });

  it('怪物側機制未開的鑲材標明「尚未開放」，免得玩家白刷', () => {
    render(<TalentAffixTable />);
    const blocked = TALENT_AFFIX_DEFS.filter(d => d.blocked);
    expect(blocked.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/尚未開放/)).toHaveLength(blocked.length);
  });
});

describe('合成與掉落表', () => {
  it('T1 沒有合成成功率（它是起點），T7 標明不掉落', () => {
    render(<TalentFusionTable />);
    const rows = [...document.querySelectorAll('tbody tr')].map(r =>
      [...r.querySelectorAll('td')].map(td => td.textContent));
    const t1 = rows.find(r => r[0] === 'T1')!;
    const t7 = rows.find(r => r[0] === 'T7')!;
    expect(t1[1]).toBe('—');
    expect(t7[2]).toBe('不掉落');
  });

  /* § 51.3.2：配置之間是換裝，Wiki 沒講清楚玩家會以為切分頁能複製一整套 */
  it('說明天賦配置是換裝，不是複製', () => {
    render(<TalentsPage />);
    expect(screen.getByText(/配置之間是換裝，不是複製/)).toBeDefined();
  });

  it('說明天賦格與鑲材的取得與型態', () => {
    render(<TalentsPage />);
    expect(screen.getByRole('heading', { name: '天賦格與鑲材' })).toBeDefined();
    // 指定型綁定後不可更改（§ 51.4.1）是玩家最容易踩的一條
    expect(screen.getByText(/首次鑲入時選定，之後不可更改/)).toBeDefined();
  });
});