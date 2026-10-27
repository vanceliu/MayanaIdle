import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EntityHoverText } from '../EntityHoverText';

/**
 * @vitest-environment jsdom
 */

/** 懸停名稱（`16-tech-frontend-architecture.md` § 32.3.2、`11-guild.md` § 11.7） */
describe('懸停名稱的公會行', () => {
  it('有公會：兩行，公會名在上、角色名在下', () => {
    const { container } = render(<div><EntityHoverText text="夏天" guild="星辰" /></div>);
    const lines = [...container.firstElementChild!.children].map(el => [el.className, el.textContent]);
    expect(lines).toEqual([['entity-hover-guild', '《星辰》'], ['entity-hover-name', '夏天']]);
  });

  it('無公會（含 NPC、怪物）：只有名稱一行', () => {
    const { container } = render(<div><EntityHoverText text="鐵匠鋪" /></div>);
    expect(container.firstElementChild!.textContent).toBe('鐵匠鋪');
    expect(container.querySelector('.entity-hover-guild')).toBeNull();
  });
});
