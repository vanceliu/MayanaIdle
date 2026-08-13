import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TALENT_RULE_DEFS } from '../../../db/seed/talentSeeds';
import { SLOT_TIER_BAND, FUSE_INPUT_COUNT } from '../../../models/talent';
import { TalentsPage, TalentFusionTable } from '../TalentsPage';
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
  // 選得到的都要列；「永遠」與 blocked 的不算（§ 51.3.1、§ 51.4.3.2）
  it('每一個選得到的條件與動作都列得出來', () => {
    render(<TalentsPage />);
    const selectable = new Set(TALENT_RULE_DEFS.filter(d => !d.blocked).map(d => d.ruleId));
    for (const labels of ALL_LABELS) {
      for (const [key, label] of Object.entries(labels)) {
        if (!selectable.has(key)) continue;
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
    expect(screen.getByText(/每 1200ms/)).toBeDefined();
  });

  it('點出「沒有攻擊規則就不出手」這個容易踩的雷', () => {
    render(<TalentsPage />);
    expect(screen.getByText(/完全不出手/)).toBeDefined();
  });

  /* § 51.4.1：條件與動作內建，Wiki 不該再有「怎麼取得」這種欄位 */
  it('講明條件與動作全部內建，不必去刷', () => {
    render(<TalentsPage />);
    expect(screen.getByText(/條件與動作全部內建/)).toBeDefined();
    expect(screen.getByText(/不掉落、不合成/)).toBeDefined();
  });

  /* § 51.3.2：天賦格是換裝，Wiki 沒講清楚玩家會以為切分頁能複製一整套 */
  it('說明天賦格是換裝、條件與動作是複製', () => {
    render(<TalentsPage />);
    expect(screen.getByText(/天賦格是換裝，條件與動作是複製/)).toBeDefined();
  });

  it('說明天賦格的取得與階級', () => {
    render(<TalentsPage />);
    expect(screen.getByRole('heading', { name: '天賦格' })).toBeDefined();
    expect(screen.getByText(/每 5 級/)).toBeDefined();
  });

  /* 條件槽留空就是永遠（§ 51.3.1），所以沒有也不需要「永遠」這一筆 */
  it('條件表不列沒有對應定義的項目', () => {
    render(<TalentsPage />);
    expect(screen.queryByText('永遠')).toBeNull();
  });

  // 沒接上引擎的現在選不到，列在條件表會讓玩家白找（§ 51.4.3.2）
  it('條件表不列 blocked 的項目', () => {
    render(<TalentsPage />);
    for (const def of TALENT_RULE_DEFS.filter(d => d.blocked)) {
      const label = COMBAT_CONDITION_LABELS[def.ruleId as keyof typeof COMBAT_CONDITION_LABELS];
      if (label) expect(screen.queryByText(label)).toBeNull();
    }
  });
});

describe('合成與掉落表', () => {
  it('列出完整的天賦格合成鏈與換算成本', () => {
    render(<TalentFusionTable />);
    const rows = [...document.querySelectorAll('tbody tr')].map(r =>
      [...r.querySelectorAll('td')].map(td => td.textContent));
    expect(rows).toContainEqual([`T1 ×${FUSE_INPUT_COUNT} → T2 ×1`, '2']);
    expect(rows).toContainEqual([`T3 ×${FUSE_INPUT_COUNT} → T4 ×1`, '8']);
  });

  it('掉落分帶跟著常數走，不是寫死的', () => {
    render(<TalentFusionTable />);
    const rows = [...document.querySelectorAll('tbody tr')]
      .map(r => [...r.querySelectorAll('td')].map(td => td.textContent));

    for (const b of SLOT_TIER_BAND) {
      const area = b.maxAreaLevel === Infinity ? '61+' : `～${b.maxAreaLevel}`;
      const expected = b.min === b.max ? `T${b.min}` : `T${b.min}～T${b.max}`;
      expect(rows).toContainEqual([area, expected]);
    }
  });

  /* 升級／兌換／降階已隨鑲材一併廢除（§ 51.5.2），表格不該再有那三欄 */
  it('表格只剩合成鏈與掉落分帶', () => {
    render(<TalentFusionTable />);
    const headers = [...document.querySelectorAll('th')].map(th => th.textContent);
    expect(headers).toEqual(['合成', '換算成 T1 格', '區域最高等級', '可掉天賦格']);
  });
});
