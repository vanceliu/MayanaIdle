import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PartyPanelContent, OnMapPanelContent, PartyButton, OnMapButton } from '../PartyPanel';
import { usePartyStore } from '../../stores/partyStore';
import { useGameStore } from '../../stores/gameStore';
import { useOnlineStore, type OnlineState } from '../../net/online';

/**
 * @vitest-environment jsdom
 */

/**
 * 隊伍面板的名稱邀請（`97-selfhosted-server.md` § 97.7.3）：
 * 在線名單只有同一張地圖的人，別張地圖的隊友只能用名稱邀。
 */
describe('隊伍面板：以角色名稱邀請', () => {
  beforeEach(() => {
    usePartyStore.setState({ party: null, invites: [], teammates: [], onMap: [], message: null });
    useGameStore.setState({ character: { id: 1, name: '我' } as never });
  });

  function withInvite(invite: (target: number | string) => Promise<boolean>) {
    usePartyStore.setState({ invite });
    render(<PartyPanelContent />);
    return {
      input: screen.getByLabelText('邀請角色名稱') as HTMLInputElement,
      button: screen.getByRole('button', { name: '邀請' }) as HTMLButtonElement,
    };
  }

  it('送出時把輸入的名稱交給 invite，成功後清空', async () => {
    const invite = vi.fn(async () => true);
    const { input, button } = withInvite(invite);

    fireEvent.change(input, { target: { value: '  Bob  ' } });
    fireEvent.click(button);

    await waitFor(() => expect(invite).toHaveBeenCalledWith('Bob'));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('失敗時保留輸入，讓玩家改字而不是重打', async () => {
    const invite = vi.fn(async () => false);
    const { input, button } = withInvite(invite);

    fireEvent.change(input, { target: { value: 'Bob' } });
    fireEvent.click(button);

    await waitFor(() => expect(invite).toHaveBeenCalled());
    expect(input.value).toBe('Bob');
  });

  it('空白名稱不送出', () => {
    const invite = vi.fn(async () => true);
    const { input, button } = withInvite(invite);

    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '   ' } });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(invite).not.toHaveBeenCalled();
  });

  it('不是隊長就不能邀請', () => {
    usePartyStore.setState({
      party: {
        id: 'p', leaderId: 2, dropMode: 'participants',
        members: [
          { characterId: 2, name: '隊長', className: 'knight', level: 5, hp: 1, maxHp: 1, mp: 1, maxMp: 1, regionId: 'neutral-town', floor: null, online: true },
          { characterId: 1, name: '我', className: 'knight', level: 5, hp: 1, maxHp: 1, mp: 1, maxMp: 1, regionId: 'neutral-town', floor: null, online: true },
        ],
      } as never,
    });
    const { input, button } = withInvite(vi.fn(async () => true));
    expect(input.disabled).toBe(true);
    expect(button.disabled).toBe(true);
  });
});

/**
 * 操作結果訊息只屬於那一次（`97-selfhosted-server.md` § 97.7.3）：
 * 面板關掉再打開還掛著「已邀請 X」會讓人以為又邀了一次。
 */
describe('隊伍面板：結果訊息在重新開啟時清掉', () => {
  beforeEach(() => {
    usePartyStore.setState({ party: null, invites: [], teammates: [], onMap: [], message: null, invite: async () => true });
    useGameStore.setState({ character: { id: 1, name: '我' } as never });
  });

  it('隊伍面板重新開啟不留上一次的訊息', () => {
    usePartyStore.setState({ message: '已邀請 秋天' });
    const first = render(<PartyPanelContent />);
    expect(usePartyStore.getState().message).toBeNull();

    first.unmount();
    usePartyStore.setState({ message: '已邀請 秋天' });
    render(<PartyPanelContent />);
    expect(screen.queryByText('已邀請 秋天')).toBeNull();
  });

  it('本地圖玩家面板同樣不留', () => {
    usePartyStore.setState({ message: '已邀請 秋天' });
    render(<OnMapPanelContent />);
    expect(screen.queryByText('已邀請 秋天')).toBeNull();
  });

  it('名單只在對方被標記過隊籍時顯示「已有隊伍」', () => {
    const rows = [
      { characterId: 2, name: '秋天', className: 'elementalist', level: 1, inParty: false },
      { characterId: 3, name: '冬天', className: 'knight', level: 1, inParty: true },
    ];
    usePartyStore.setState({ onMap: rows as never });
    render(<OnMapPanelContent />);

    expect(screen.getAllByText('已有隊伍')).toHaveLength(1);
    // 未標記的人照樣邀得出去
    expect(screen.getAllByRole('button', { name: '邀請' })).toHaveLength(1);
  });
});

/**
 * 單機世界沒有別的玩家，隊伍與在線名單的入口就不該存在（§ 97.1）。
 * 單機一樣是連著一個 server，所以判斷條件是世界形態而不是有沒有連線。
 */
describe('單機世界隱藏隊伍與在線名單', () => {
  beforeEach(() => {
    usePartyStore.setState({ party: null, invites: [{ fromCharacterId: 2, fromName: 'Bob' }] as never });
    useGameStore.setState({ character: { id: 1, name: '我' } as never });
  });

  const cases: Array<[string, Partial<OnlineState>]> = [
    ['沒連 server', { enabled: false, status: 'offline', worldMode: null }],
    ['單機形態', { enabled: true, status: 'authed', worldMode: 'solo' }],
  ];

  for (const [label, state] of cases) {
    it(`${label}：兩個按鈕都不出現`, () => {
      useOnlineStore.setState(state as never);
      const party = render(<PartyButton />);
      const onmap = render(<OnMapButton />);

      expect(party.container.querySelector('button')).toBeNull();
      expect(onmap.container.querySelector('button')).toBeNull();
    });
  }

  it('開放形態：兩個按鈕都在', () => {
    useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'open' });
    const party = render(<PartyButton />);
    const onmap = render(<OnMapButton />);

    expect(party.container.querySelector('button')).toBeTruthy();
    expect(onmap.container.querySelector('button')).toBeTruthy();
  });
});
