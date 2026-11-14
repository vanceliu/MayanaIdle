import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BountyTab, BOUNTY_SOLO_HINT } from '../town/BountyTab';
import { useGameStore } from '../../stores/gameStore';

/**
 * @vitest-environment jsdom
 */

describe('懸賞分頁 — 單人限制提示（§ 53.7）', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: { name: 'TestBounty', className: 'knight', level: 60, gold: 0, currentArea: 'greyridge-town', currentRegion: 'greyridge-town', currentFloor: null } as never,
      bountyBoards: {},
      bountyContracts: [],
    });
  });

  it('契約清單上方顯示只在單人時生效的提示', () => {
    render(<BountyTab townId="greyridge-town" townName="灰脊" />);
    expect(screen.getByText(BOUNTY_SOLO_HINT)).toBeTruthy();
  });
});
