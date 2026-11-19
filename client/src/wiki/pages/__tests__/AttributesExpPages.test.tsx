import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { AttributesPage } from '../AttributesPage';
import { ExpTablePage } from '../ExpTablePage';
import { CLASS_HP_MP_FORMULA } from '../../../systems/maxHpMp';
import { LEVEL_CAP } from '../../../systems/levelUp';

/**
 * @vitest-environment jsdom
 *
 * Wiki 屬性公式與經驗表（`43-wiki-system.md` § 4.8、§ 4.9）：數值取自 model 常數。
 */
describe('AttributesPage', () => {
  afterEach(cleanup);

  it('最大 HP／MP 表逐職業列出比值與加成', () => {
    render(<AttributesPage />);
    const table = screen.getByRole('columnheader', { name: 'HP 比值' }).closest('table')!;
    const knightRow = within(table).getByRole('row', { name: /^騎士/ });
    const f = CLASS_HP_MP_FORMULA.knight;
    expect(knightRow.textContent).toBe(`騎士${f.hpRatio}${f.hpBonus}${f.mpRatio}${f.mpBonus}`);
    expect(screen.queryByText(/random\(VIT/)).toBeNull();
  });
});

describe('ExpTablePage', () => {
  afterEach(cleanup);

  it('列到等級上限前一級，並說明上限', () => {
    render(<ExpTablePage />);
    expect(screen.getByRole('cell', { name: String(LEVEL_CAP - 1) })).toBeTruthy();
    expect(screen.queryByRole('cell', { name: String(LEVEL_CAP) })).toBeNull();
    expect(screen.getByText(new RegExp(`等級上限 ${LEVEL_CAP}`))).toBeTruthy();
  });
});
