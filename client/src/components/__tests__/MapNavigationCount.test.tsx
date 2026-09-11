import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapNavigation } from '../MapNavigation';
import { OnMapButton } from '../PartyPanel';
import { useGameStore } from '../../stores/gameStore';
import { usePartyStore } from '../../stores/partyStore';
import { useOnlineStore } from '../../net/online';

/**
 * @vitest-environment jsdom
 */

/**
 * 本地圖在線人數（`97-selfhosted-server.md` § 97.7.1）：
 * 標在地圖選擇器的「目前:」上，面板按鈕不再重複標同一個數字。
 */
describe('地圖選擇器的在線人數', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: { id: 1, name: '我', currentRegion: 'neutral-town', currentZone: 'newbie-neutral', currentFloor: null } as never,
      phase: 'explore',
    });
    usePartyStore.setState({ onMap: [] });
  });

  afterEach(() => useOnlineStore.setState({ enabled: false, status: 'offline', worldMode: null }));

  const person = (characterId: number) => ({
    characterId, name: `P${characterId}`, className: 'knight', level: 1, inParty: false,
  });

  it('線上顯示人數，且**含自己**', () => {
    useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'open' });
    usePartyStore.setState({ onMap: [person(2), person(3)] as never });
    render(<MapNavigation />);

    expect(screen.getByText('3 人')).toBeTruthy();
  });

  it('地圖上只有自己時是 1 人', () => {
    useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'open' });
    render(<MapNavigation />);

    expect(screen.getByText('1 人')).toBeTruthy();
  });

  it('沒連 server 不顯示人數', () => {
    const { container } = render(<MapNavigation />);
    expect(container.querySelector('.map-selector-count')).toBeNull();
  });

  // 單機世界也是連著一個 server 的，所以不能只看有沒有連線（§ 97.1）
  it('單機形態不顯示人數', () => {
    useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'solo' });
    const { container } = render(<MapNavigation />);
    expect(container.querySelector('.map-selector-count')).toBeNull();
  });

  it('面板按鈕不再標人數徽章（同一個數字不放兩處）', () => {
    useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'open' });
    usePartyStore.setState({ onMap: [person(2)] as never });
    const { container } = render(<OnMapButton />);

    expect(container.querySelector('.quest-count-badge')).toBeNull();
  });
});
