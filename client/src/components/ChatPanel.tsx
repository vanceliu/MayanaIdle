import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { usePartyStore } from '../stores/partyStore';
import { useChatStore, visibleMessages, CHAT_CHANNELS, CHAT_CHANNEL_LABELS } from '../stores/chatStore';
import { useAutoScrollLog } from '../hooks/useAutoScrollLog';
import { getRegion } from '../models/mapData';
import type { ChatChannel, ChatMessageView } from '../net/protocol';

/**
 * 聊天內容（`97-selfhosted-server.md` § 97.7.2）。視窗與分頁在 `LogDock`。
 *
 * 上面那排是**顯示過濾**（共用一份 log），送出的頻道由輸入格左邊的選單決定。
 * 玩家名稱可點：**一律設為密語對象**。邀請組隊與交易在「本地圖玩家」面板，
 * 聊天裡點名字只會有一種結果，不必先想自己在哪個頻道。
 * 不顯示時間戳：聊天是即時的，每行一個時間只會把訊息本身擠窄。
 */

/** 一則訊息的抬頭：密語要看得出方向（→ 送出／← 收到） */
function messageLabel(m: ChatMessageView, myId: number | undefined): string {
  if (m.channel !== 'whisper') return m.from.name;
  return m.from.characterId === myId ? `→ ${m.to?.name ?? ''}` : `← ${m.from.name}`;
}

/** 密語的方向樣式：送出與收到必須不同色，否則一整串分不出誰講的 */
function whisperDirection(m: ChatMessageView, myId: number | undefined): string {
  if (m.channel !== 'whisper') return '';
  return m.from.characterId === myId ? ' is-outgoing' : ' is-incoming';
}

export function ChatPanelContent() {
  const messages = useChatStore(s => s.messages);
  const visible = useChatStore(s => s.visible);
  const toggleVisible = useChatStore(s => s.toggleVisible);
  const input = useChatStore(s => s.input);
  const setInput = useChatStore(s => s.setInput);
  const whisperTarget = useChatStore(s => s.whisperTarget);
  const setWhisperTarget = useChatStore(s => s.setWhisperTarget);
  const send = useChatStore(s => s.send);
  const party = usePartyStore(s => s.party);
  const myId = useGameStore(s => s.character?.id);
  const regionId = useGameStore(s => s.character?.currentRegion);
  const inTown = !!regionId && getRegion(regionId)?.type === 'town';
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const shown = visibleMessages(messages, visible);
  const { ref, onScroll } = useAutoScrollLog<HTMLDivElement>(shown);

  const canSend = (channel: ChatChannel): boolean => {
    if (channel === 'party') return !!party;
    if (channel === 'town') return inTown;
    // 公會頻道要有公會才成立（`11-guild.md` § 11.1）；本版沒有公會資料
    if (channel === 'guild') return false;
    if (channel === 'whisper') return whisperTarget.trim().length > 0;
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(null);
    try {
      await send(input, body, input === 'whisper' ? whisperTarget.trim() : undefined);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '送出失敗');
    }
  };

  /** 點名稱一律設為密語對象；組隊與交易走「本地圖玩家」面板 */
  const onNameClick = (m: ChatMessageView) => {
    const other = m.from.characterId === myId ? m.to : m.from;
    if (!other || other.characterId === myId) return;
    setWhisperTarget(other.name);
    setInput('whisper');
  };

  return (
    <div className="chat-body">
      {/* 分類鈕＝顯示過濾，可多選；關掉的頻道仍會收，只是不畫 */}
      <div className="chat-tabs">
        {CHAT_CHANNELS.map(ch => (
          <button
            key={ch}
            className={`chat-tab ${visible[ch] ? 'active' : ''}`}
            aria-pressed={visible[ch]}
            title={`顯示／隱藏${CHAT_CHANNEL_LABELS[ch]}頻道`}
            onClick={() => toggleVisible(ch)}
          >
            {CHAT_CHANNEL_LABELS[ch]}
          </button>
        ))}
      </div>

      <div className="combat-log bottom-log chat-log" ref={ref} onScroll={onScroll}>
        {shown.length === 0 && (
          <div className="log-entry log-system">
            {messages.length === 0 ? '還沒有訊息' : '目前的分類全部關掉了'}
          </div>
        )}
        {shown.map(m => (
          <div key={m.id} className={`log-entry chat-line chat-${m.channel}${whisperDirection(m, myId)}${m.from.characterId === myId ? ' is-mine' : ''}`}>
            <span className="chat-channel">[{CHAT_CHANNEL_LABELS[m.channel]}]</span>
            <button
              className="chat-name chat-name-btn"
              title="設為密語對象"
              onClick={() => onNameClick(m)}
            >
              {messageLabel(m, myId)}
            </button>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
      </div>

      <form className="chat-input-row" onSubmit={submit}>
        {/* 送出的頻道在輸入格左邊，與上面的顯示過濾是兩件事 */}
        <select
          className="chat-input-channel"
          value={input}
          aria-label="發言頻道"
          onChange={e => setInput(e.target.value as ChatChannel)}
        >
          {CHAT_CHANNELS.map(ch => (
            <option key={ch} value={ch}>{CHAT_CHANNEL_LABELS[ch]}</option>
          ))}
        </select>
        {input === 'whisper' && (
          <input
            className="chat-whisper-target"
            value={whisperTarget}
            placeholder="角色名稱"
            aria-label="密語對象"
            onChange={e => setWhisperTarget(e.target.value)}
          />
        )}
        <input
          className="chat-input"
          value={text}
          disabled={!canSend(input)}
          placeholder={canSend(input) ? `對${CHAT_CHANNEL_LABELS[input]}頻道說…` : input === 'whisper' ? '先填密語對象' : '此頻道目前不可發言'}
          onChange={e => setText(e.target.value)}
          aria-label="聊天輸入"
        />
        <button className="chat-send-btn" type="submit" disabled={!canSend(input) || !text.trim()}>送出</button>
      </form>
      {error && <div className="chat-error" role="alert">{error}</div>}
    </div>
  );
}
