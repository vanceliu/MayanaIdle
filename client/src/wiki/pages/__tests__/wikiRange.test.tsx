// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AffixesPage } from '../AffixesPage';

vi.mock('../../../components/GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

describe('Wiki 數值區間黃色標示（`43-wiki-system.md` § 4.2.1）', () => {
  it('詞綴一覽、T7 獨有詞綴、隨機技能的區間都帶 .wiki-range；無數值的不帶', () => {
    const { container } = render(<MemoryRouter><AffixesPage /></MemoryRouter>);
    const marked = Array.from(container.querySelectorAll('.wiki-range')).map(e => e.textContent ?? '');
    expect(marked).toContain('10~15');
    expect(marked).toContain('5~10%');
    expect(marked.some(t => t.includes(' ~ '))).toBe(true);
    expect(marked).not.toContain('—');
  });
});
