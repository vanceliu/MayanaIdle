import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ArenaPage } from '../ArenaPage';
import { ARENA_TIERS, arenaBossOrder, arenaGoldCost } from '../../../models/arena';

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

  it('入場只收金幣，由隊長付、金幣取自身上與帳號倉庫（§ 55.1）', () => {
    render(<ArenaPage />);
    for (const t of ARENA_TIERS) expect(screen.getByText(arenaGoldCost(t.tier).toLocaleString())).toBeTruthy();
    expect(screen.queryByText(/入場材料/)).toBeNull();
    expect(screen.getByText(/入場費只收金幣，組隊時由隊長付/)).toBeTruthy();
    expect(screen.getByText(/先扣身上，不足再扣帳號倉庫/)).toBeTruthy();
  });

  it('組隊數量表依 model 計算', () => {
    render(<ArenaPage />);
    const rows = screen.getAllByRole('row').map(r => r.textContent);
    expect(rows).toContain('4107');
  });

  it('強化詞綴表依段位間隔計算，100 波內不出現的寫「—」', () => {
    render(<ArenaPage />);
    const rows = screen.getAllByRole('row').map(r => r.textContent);
    expect(rows).toContain('01～30 波1～20 波1～10 波1～10 波');
    expect(rows).toContain('4—81～100 波41～100 波41～100 波');
  });
});
