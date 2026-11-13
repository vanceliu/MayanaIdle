import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ArenaPage } from '../ArenaPage';
import { ARENA_TIERS, arenaBossOrder } from '../../../models/arena';

/**
 * @vitest-environment jsdom
 *
 * Wiki 競技場頁（`43-wiki-system.md` § 4.12.1）：段位表與 model 一致。
 */
describe('ArenaPage', () => {
  afterEach(cleanup);

  it('每個段位一列，T7 標示未開放', () => {
    render(<ArenaPage />);
    for (const t of ARENA_TIERS) {
      expect(screen.getAllByText(`T${t.tier}${t.open ? '' : '（未開放）'}`).length).toBeGreaterThan(0);
      expect(screen.getByText(arenaBossOrder(t).map(b => b.name).join(' → '))).toBeTruthy();
    }
  });

  it('組隊數量表依 model 計算', () => {
    render(<ArenaPage />);
    const rows = screen.getAllByRole('row').map(r => r.textContent);
    expect(rows).toContain('4107');
  });
});
