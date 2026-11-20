import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ArenaPage } from '../ArenaPage';
import { ARENA_TIERS, arenaBossOrder } from '../../../models/arena';
import { ARENA_RECOMMENDATIONS, formatArenaGear } from '../../data/arenaRecommendation';

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

  it('最低推薦裝備：已開放段位 × 五職業各一列', () => {
    const open = ARENA_TIERS.filter(t => t.open).map(t => t.tier);
    expect(new Set(ARENA_RECOMMENDATIONS.map(r => r.tier))).toEqual(new Set(open));
    for (const tier of open) {
      expect(new Set(ARENA_RECOMMENDATIONS.filter(r => r.tier === tier).map(r => r.className)))
        .toEqual(new Set(['knight', 'elf', 'thief', 'elementalist', 'priest']));
    }
    render(<ArenaPage />);
    const rows = screen.getAllByRole('row').map(r => r.textContent ?? '');
    for (const r of ARENA_RECOMMENDATIONS) {
      expect(rows.some(row => row.includes(formatArenaGear(r)) && row.endsWith(`${r.potionsMedian}${r.potionsMax}`)), `T${r.tier} ${r.className}`).toBe(true);
    }
  });

  it('裝備文字：該階為製作品、低一階為裝備；+0 不分武器防具', () => {
    const base = { tier: 5, className: 'priest', weaponEnhance: 0, armorEnhance: 0, potionsMedian: 0, potionsMax: 0 } as const;
    expect(formatArenaGear({ ...base, gearTier: 4, affixTier: 3 })).toBe('T4 裝備 +0、詞綴 T3');
    expect(formatArenaGear({ ...base, gearTier: 5, affixTier: 4, weaponEnhance: 6, armorEnhance: 5 })).toBe('T5 製作品 武器 +6／防具 +5、詞綴 T4');
  });
});
