import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, visibleMessages, CHAT_BUFFER } from '../chatStore';
import type { ChatChannel, ChatMessageView } from '../../net/protocol';

/**
 * 聊天狀態（`97-selfhosted-server.md` § 97.7.2）。
 *
 * **一份共用的 log**：所有頻道照時間排在同一串，上面的分類鈕只決定顯不顯示。
 * 分頻道各存一份的話，同一段對話會被切在不同分頁裡。
 */
function msg(id: number, channel: ChatChannel = 'world'): ChatMessageView {
  return { id, channel, from: { characterId: 1, name: 'A' }, text: `m${id}`, at: id };
}

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    useChatStore.getState().setPanelOpen(false);
    useChatStore.setState({ visible: { world: true, guild: true, party: true, town: true, whisper: true }, input: 'world' });
  });

  it('所有頻道進同一串，順序照收到的時間', () => {
    useChatStore.getState().receive(msg(1, 'world'));
    useChatStore.getState().receive(msg(2, 'party'));
    useChatStore.getState().receive(msg(3, 'whisper'));
    expect(useChatStore.getState().messages.map(m => [m.id, m.channel])).toEqual([
      [1, 'world'], [2, 'party'], [3, 'whisper'],
    ]);
  });

  it('分類鈕只過濾顯示，訊息照收', () => {
    const chat = useChatStore.getState();
    chat.receive(msg(1, 'world'));
    chat.receive(msg(2, 'party'));
    chat.toggleVisible('world');

    const { messages, visible } = useChatStore.getState();
    expect(visible.world).toBe(false);
    expect(messages).toHaveLength(2);
    expect(visibleMessages(messages, visible).map(m => m.id)).toEqual([2]);

    useChatStore.getState().toggleVisible('world');
    expect(visibleMessages(useChatStore.getState().messages, useChatStore.getState().visible)).toHaveLength(2);
  });

  it('發言頻道與顯示過濾是兩件事', () => {
    useChatStore.getState().toggleVisible('whisper');
    useChatStore.getState().setInput('whisper');
    expect(useChatStore.getState().input).toBe('whisper');
    expect(useChatStore.getState().visible.whisper).toBe(false);
  });

  it('密語對象記在 store，供輸入格與點名稱共用', () => {
    useChatStore.getState().setWhisperTarget('42');
    expect(useChatStore.getState().whisperTarget).toBe('42');
    useChatStore.getState().reset();
    expect(useChatStore.getState().whisperTarget).toBe('');
  });

  it('面板沒開時累加未讀，開啟即歸零', () => {
    useChatStore.getState().receive(msg(1));
    useChatStore.getState().receive(msg(2, 'party'));
    expect(useChatStore.getState().unread).toBe(2);
    useChatStore.getState().setPanelOpen(true);
    expect(useChatStore.getState().unread).toBe(0);
    useChatStore.getState().receive(msg(3));
    expect(useChatStore.getState().unread).toBe(0);
  });

  it('共用 log 只留最後 300 則', () => {
    for (let i = 0; i < CHAT_BUFFER + 20; i++) useChatStore.getState().receive(msg(i));
    const list = useChatStore.getState().messages;
    expect(list).toHaveLength(CHAT_BUFFER);
    expect(list[0].id).toBe(20);
  });
});
