import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MapsPage } from '../MapsPage';
import { getRegionsByZone } from '../../../models/mapData';

/**
 * @vitest-environment jsdom
 *
 * Wiki 地圖總覽（`43-wiki-system.md` § 4.4）：不列試驗場與競技場。
 */
describe('MapsPage', () => {
  afterEach(cleanup);

  it('新手區列出野外與城鎮，不列試驗場與競技場', () => {
    render(<MemoryRouter><MapsPage /></MemoryRouter>);
    for (const r of getRegionsByZone('newbie-neutral')) expect(screen.getAllByText(r.name).length).toBeGreaterThan(0);
    expect(screen.queryByText('試驗場')).toBeNull();
    expect(screen.queryByText('競技場')).toBeNull();
  });
});
