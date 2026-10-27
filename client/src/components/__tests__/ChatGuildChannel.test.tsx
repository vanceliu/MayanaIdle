import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanelContent } from '../ChatPanel';
import { useChatStore } from '../../stores/chatStore';
import { useGuildStore } from '../../stores/guildStore';
import { useGameStore } from '../../stores/gameStore';

/**
 * @vitest-environment jsdom
 */

/** 公會頻道（`97-selfhosted-server.md` § 97.7.2）：有公會才能發言 */
describe('聊天：公會頻道', () => {
  beforeEach(() => {
    useGameStore.setState({ character: { id: 1, name: '我', currentRegion: 'dawn-plains' } as never });
    useChatStore.setState({ input: 'guild', messages: [] });
  });

  it('無公會：輸入格停用', () => {
    useGuildStore.setState({ guild: null });
    render(<ChatPanelContent />);
    const input = screen.getByLabelText('聊天輸入') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe('此頻道目前不可發言');
  });

  it('有公會：可以發言', () => {
    useGuildStore.setState({ guild: { id: 1, name: '星辰', leaderId: 1, capacity: 24, members: [] } });
    render(<ChatPanelContent />);
    const input = screen.getByLabelText('聊天輸入') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toBe('對公會頻道說…');
  });

  it('訊息列帶頻道 class，供頻道色套用', () => {
    useGuildStore.setState({ guild: null });
    useChatStore.setState({
      messages: [
        { id: 1, channel: 'guild', from: { characterId: 2, name: 'A' }, text: '嗨', at: 0 },
        { id: 2, channel: 'town', from: { characterId: 3, name: 'B' }, text: '喲', at: 0 },
      ],
    });
    const { container } = render(<ChatPanelContent />);
    expect(container.querySelector('.chat-line.chat-guild')?.textContent).toContain('嗨');
    expect(container.querySelector('.chat-line.chat-town')?.textContent).toContain('喲');
  });
});
