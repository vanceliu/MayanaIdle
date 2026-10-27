import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SocialButton, SocialPanelContent } from '../SocialPanel';
import { GuildPanelContent } from '../GuildPanel';
import { OnMapPanelContent } from '../PartyPanel';
import { GuildNpc } from '../town/GuildNpc';
import { TownView } from '../TownView';
import { usePartyStore } from '../../stores/partyStore';
import { useGuildStore, type GuildView } from '../../stores/guildStore';
import { useGameStore } from '../../stores/gameStore';
import { useOnlineStore } from '../../net/online';
import { useTradeStore } from '../../stores/tradeStore';
import { useChatStore } from '../../stores/chatStore';

/**
 * @vitest-environment jsdom
 */

const GUILD: GuildView = {
  id: 1,
  name: '星辰',
  leaderId: 1,
  capacity: 24,
  members: [
    { characterId: 1, name: '盟主', className: 'knight', level: 30, online: true, joinedAt: 1 },
    { characterId: 2, name: '秋天', className: 'elf', level: 12, online: true, joinedAt: 2 },
    { characterId: 3, name: '冬天', className: 'priest', level: 15, online: false, joinedAt: 3 },
  ],
};

function asCharacter(id: number, level = 30) {
  useGameStore.setState({ character: { id, name: `角色${id}`, level, currentRegion: 'neutral-town' } as never });
}

beforeEach(() => {
  usePartyStore.setState({ party: null, invites: [], teammates: [], onMap: [], message: null });
  useGuildStore.setState({ guild: null, invites: [], message: null, clearMessage: () => {} });
  useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'open' });
  asCharacter(1);
});

describe('社群視窗（`97-selfhosted-server.md` § 97.7.5）', () => {
  it('分頁順序固定為 隊伍／公會／在線，預設隊伍', () => {
    render(<SocialPanelContent />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['隊伍', '公會', '在線']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('尚未組隊')).toBeTruthy();
  });

  it('切到公會與在線分頁', () => {
    render(<SocialPanelContent />);
    fireEvent.click(screen.getByRole('tab', { name: '公會' }));
    expect(screen.getByText('尚未加入公會')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '在線' }));
    expect(screen.getByText('這張地圖上沒有其他玩家')).toBeTruthy();
  });

  it('按鈕徽章＝隊伍邀請＋公會邀請', () => {
    usePartyStore.setState({ invites: [{ id: 'p', partyId: '', fromCharacterId: 5, fromName: 'A', expiresAt: 0 }] });
    useGuildStore.setState({ invites: [
      { id: 'g1', guildId: 1, guildName: '星辰', fromName: 'B', expiresAt: 0 },
      { id: 'g2', guildId: 2, guildName: '月光', fromName: 'C', expiresAt: 0 },
    ] });
    const { container } = render(<SocialButton />);
    expect(container.querySelector('.quest-count-badge')?.textContent).toBe('3');
  });
});

describe('公會分頁（`11-guild.md` § 11.7）', () => {
  it('盟主排第一列，金色 ♛ 與金色名稱', () => {
    useGuildStore.setState({ guild: GUILD });
    const { container } = render(<GuildPanelContent />);
    expect(screen.getByText('星辰（3/24）')).toBeTruthy();
    const rows = container.querySelectorAll('.party-row');
    expect(rows[0].querySelector('.guild-leader-mark')?.textContent).toBe('♛');
    expect(rows[0].querySelector('.guild-leader-name')?.textContent).toContain('盟主');
    expect(container.querySelectorAll('.guild-leader-mark')).toHaveLength(1);
    expect(rows[2].className).toContain('is-offline');
    // 每人一行，不寫在線／離線，離線只靠變暗（§ 11.7）
    for (const row of rows) expect(row.querySelector('.guild-member-line')).not.toBeNull();
    expect(container.textContent).not.toMatch(/在線|離線/);
  });

  it('盟主：可用名稱邀請、可踢其他人，沒有退出鈕', async () => {
    const kick = vi.fn(async () => true);
    const invite = vi.fn(async () => true);
    useGuildStore.setState({ guild: GUILD, kick, invite });
    render(<GuildPanelContent />);
    expect(screen.getAllByRole('button', { name: '踢除' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '退出公會' })).toBeNull();

    const input = screen.getByLabelText('邀請角色名稱');
    fireEvent.change(input, { target: { value: '夏天' } });
    fireEvent.click(within(input.closest('form') as HTMLElement).getByRole('button', { name: '邀請' }));
    await waitFor(() => expect(invite).toHaveBeenCalledWith('夏天'));
    fireEvent.click(screen.getAllByRole('button', { name: '踢除' })[0]);
    expect(kick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '確定踢除' }));
    expect(kick).toHaveBeenCalledWith(2);
  });

  it('踢除要二次確認；取消後不送出、按鈕恢復（§ 11.6）', () => {
    const kick = vi.fn(async () => true);
    useGuildStore.setState({ guild: GUILD, kick });
    const { container } = render(<GuildPanelContent />);
    const row = container.querySelectorAll('.party-row')[1] as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '踢除' }));
    expect(within(row).getByText('確定踢除？')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: '密語' })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: '取消' }));
    expect(kick).not.toHaveBeenCalled();
    expect(within(row).getByRole('button', { name: '踢除' })).toBeTruthy();
  });

  it('人數已滿時邀請輸入停用', () => {
    useGuildStore.setState({ guild: { ...GUILD, capacity: 3 } });
    render(<GuildPanelContent />);
    expect((screen.getByLabelText('邀請角色名稱') as HTMLInputElement).disabled).toBe(true);
  });

  it('成員：只能退出，看不到邀請與踢人', () => {
    asCharacter(2);
    const leave = vi.fn(async () => true);
    useGuildStore.setState({ guild: GUILD, leave });
    render(<GuildPanelContent />);
    expect(screen.queryByLabelText('邀請角色名稱')).toBeNull();
    expect(screen.queryByRole('button', { name: '踢除' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '退出公會' }));
    expect(leave).toHaveBeenCalled();
  });

  it('收到的公會邀請可接受或拒絕', () => {
    const accept = vi.fn(async () => true);
    useGuildStore.setState({ invites: [{ id: 'g1', guildId: 1, guildName: '星辰', fromName: '盟主', expiresAt: 0 }], accept });
    render(<GuildPanelContent />);
    expect(screen.getByText('盟主 邀請你加入公會「星辰」')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '接受' }));
    expect(accept).toHaveBeenCalledWith('g1');
  });
});

describe('公會分頁的成員列動作（§ 11.7）', () => {
  it('其他成員有密語、交易、組隊邀請；自己那列沒有', () => {
    useGuildStore.setState({ guild: GUILD });
    const { container } = render(<GuildPanelContent />);
    const rows = [...container.querySelectorAll('.party-row')] as HTMLElement[];
    expect(within(rows[0]).queryByRole('button', { name: '密語' })).toBeNull();
    for (const row of rows.slice(1)) {
      expect(within(row).getByRole('button', { name: '密語' })).toBeTruthy();
      expect(within(row).getByRole('button', { name: '交易' })).toBeTruthy();
      expect(within(row).getByRole('button', { name: '邀請' })).toBeTruthy();
    }
  });

  it('只對在線成員可按；離線成員三顆都停用', () => {
    useGuildStore.setState({ guild: GUILD });
    const { container } = render(<GuildPanelContent />);
    const [, online, offline] = [...container.querySelectorAll('.party-row')] as HTMLElement[];
    for (const name of ['密語', '交易', '邀請']) {
      expect((within(online).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false);
      expect((within(offline).getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('密語設定對象並切到密語頻道；交易與邀請送出對象 id', () => {
    const offer = vi.fn(async () => true);
    const invite = vi.fn(async () => true);
    useGuildStore.setState({ guild: GUILD });
    useTradeStore.setState({ offer });
    usePartyStore.setState({ invite });
    const { container } = render(<GuildPanelContent />);
    const row = container.querySelectorAll('.party-row')[1] as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '密語' }));
    expect(useChatStore.getState().whisperTarget).toBe('秋天');
    expect(useChatStore.getState().input).toBe('whisper');
    fireEvent.click(within(row).getByRole('button', { name: '交易' }));
    expect(offer).toHaveBeenCalledWith(2);
    fireEvent.click(within(row).getByRole('button', { name: '邀請' }));
    expect(invite).toHaveBeenCalledWith(2);
  });

  it('已是同隊伍的成員不顯示組隊邀請', () => {
    useGuildStore.setState({ guild: GUILD });
    usePartyStore.setState({ party: { id: 'p', leaderId: 1, dropMode: 'participants', members: [
      { characterId: 1, name: '盟主', className: 'knight', level: 30, hp: 1, maxHp: 1, mp: 1, maxMp: 1, regionId: '', floor: null, online: true, joinedAt: 1 },
      { characterId: 2, name: '秋天', className: 'elf', level: 12, hp: 1, maxHp: 1, mp: 1, maxMp: 1, regionId: '', floor: null, online: true, joinedAt: 2 },
    ] } });
    const { container } = render(<GuildPanelContent />);
    const row = container.querySelectorAll('.party-row')[1] as HTMLElement;
    expect(within(row).queryByRole('button', { name: '邀請' })).toBeNull();
  });
});

describe('在線分頁的公會欄位', () => {
  const rows = [
    { characterId: 7, name: '有會', className: 'knight', level: 10, inParty: false, guildName: '月光' },
    { characterId: 8, name: '無會', className: 'knight', level: 10, inParty: false },
  ];

  it('每列附公會名稱；盟主只對無公會者出現「邀入公會」', () => {
    const invite = vi.fn(async () => true);
    usePartyStore.setState({ onMap: rows as never });
    useGuildStore.setState({ guild: GUILD, invite });
    const { container } = render(<OnMapPanelContent />);
    expect(container.querySelector('.party-row-guild')?.textContent).toBe('月光');
    const buttons = screen.getAllByRole('button', { name: '邀入公會' });
    expect(buttons).toHaveLength(1);
    const row = buttons[0].closest('.party-row') as HTMLElement;
    expect(within(row).getByText('無會')).toBeTruthy();
    fireEvent.click(buttons[0]);
    expect(invite).toHaveBeenCalledWith(8);
  });

  it('不是盟主看不到「邀入公會」', () => {
    asCharacter(2);
    usePartyStore.setState({ onMap: rows as never });
    useGuildStore.setState({ guild: GUILD });
    render(<OnMapPanelContent />);
    expect(screen.queryByRole('button', { name: '邀入公會' })).toBeNull();
  });
});

describe('公會 NPC（`11-guild.md` § 11.3、§ 11.6）', () => {
  it('未滿 Lv10 不能建立', () => {
    asCharacter(1, 9);
    render(<GuildNpc />);
    expect(screen.getByText('需要等級 10 才能建立公會')).toBeTruthy();
    expect((screen.getByRole('button', { name: '建立公會' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('名稱不合規時提示並停用，合規才送出', async () => {
    const create = vi.fn(async () => true);
    useGuildStore.setState({ create });
    render(<GuildNpc />);
    const input = screen.getByLabelText('公會名稱');
    fireEvent.change(input, { target: { value: 'A' } });
    expect(screen.getByText('公會名稱至少 1 個中文或 2 個英數字')).toBeTruthy();
    expect((screen.getByRole('button', { name: '建立公會' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: '星辰' } });
    fireEvent.click(screen.getByRole('button', { name: '建立公會' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('星辰'));
  });

  it('盟主解散要二次確認，取消不送出', () => {
    const disband = vi.fn(async () => true);
    useGuildStore.setState({ guild: GUILD, disband });
    render(<GuildNpc />);
    fireEvent.click(screen.getByRole('button', { name: '解散公會' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(disband).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '解散公會' }));
    fireEvent.click(screen.getByRole('button', { name: '確定解散' }));
    expect(disband).toHaveBeenCalled();
  });

  it('成員只看到說明，沒有建立或解散', () => {
    asCharacter(2);
    useGuildStore.setState({ guild: GUILD });
    render(<GuildNpc />);
    expect(screen.queryByRole('button', { name: '解散公會' })).toBeNull();
    expect(screen.queryByRole('button', { name: '建立公會' })).toBeNull();
  });

  it('快捷列：開放世界有公會，單機世界沒有', () => {
    const open = render(<TownView />);
    expect(open.container.querySelector('button[title="公會"]')).toBeTruthy();
    open.unmount();
    useOnlineStore.setState({ enabled: true, status: 'authed', worldMode: 'solo' });
    const solo = render(<TownView />);
    expect(solo.container.querySelector('button[title="公會"]')).toBeNull();
  });
});
