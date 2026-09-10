/**
 * 聊天（`97-selfhosted-server.md` § 97.7.2）。
 *
 * **一份共用的 log**：所有頻道的訊息照時間排在同一串，上面的分類鈕只決定「顯不顯示」。
 * 分頻道各存一份的話，玩家得自己在分頁之間對時間軸，同一段對話會被切開。
 *
 * 訊息只在記憶體，換頁即清；送出走 RPC（`net/mirror.ts`），單機形態沒有聊天。
 */
import { create } from 'zustand';
import type { ChatChannel, ChatMessageView } from '../net/protocol';

export const CHAT_CHANNELS: readonly ChatChannel[] = ['world', 'party', 'town', 'guild', 'whisper'];

export const CHAT_CHANNEL_LABELS: Record<ChatChannel, string> = {
  world: '世界',
  guild: '公會',
  party: '隊伍',
  town: '城鎮',
  whisper: '密語',
};

/** 共用 log 保留的訊息數 */
export const CHAT_BUFFER = 300;

function allVisible(): Record<ChatChannel, boolean> {
  return { world: true, guild: true, party: true, town: true, whisper: true };
}

export interface ChatState {
  /** 共用 log，照收到的順序排 */
  messages: ChatMessageView[];
  /** 哪些頻道要顯示（上面那排分類鈕） */
  visible: Record<ChatChannel, boolean>;
  /** 送出時要講到哪個頻道（輸入格左邊那個選單） */
  input: ChatChannel;
  /** 密語對象：角色 ID 或角色名稱 */
  whisperTarget: string;
  /** 面板沒開時收到的訊息數（徽章） */
  unread: number;
  panelOpen: boolean;

  receive: (message: ChatMessageView) => void;
  toggleVisible: (channel: ChatChannel) => void;
  setInput: (channel: ChatChannel) => void;
  setWhisperTarget: (target: string) => void;
  setPanelOpen: (open: boolean) => void;
  send: (channel: ChatChannel, text: string, target?: string) => Promise<unknown>;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  visible: allVisible(),
  input: 'world',
  whisperTarget: '',
  unread: 0,
  panelOpen: false,

  receive: message => {
    const { messages, panelOpen, unread } = get();
    set({
      messages: [...messages, message].slice(-CHAT_BUFFER),
      unread: panelOpen ? 0 : unread + 1,
    });
  },
  toggleVisible: channel => set(s => ({ visible: { ...s.visible, [channel]: !s.visible[channel] } })),
  setInput: channel => set({ input: channel }),
  setWhisperTarget: target => set({ whisperTarget: target }),
  setPanelOpen: open => set({ panelOpen: open, unread: open ? 0 : get().unread }),
  send: async () => false,
  reset: () => set({ messages: [], unread: 0, whisperTarget: '' }),
}));

/** 依分類鈕過濾出要畫的訊息 */
export function visibleMessages(messages: ChatMessageView[], visible: Record<ChatChannel, boolean>): ChatMessageView[] {
  return messages.filter(m => visible[m.channel]);
}
