import { useEffect, useState } from 'react';
import { CombatLogPanel } from './CombatLogPanel';
import { ChatPanelContent } from './ChatPanel';
import { LogWindow, opacityKey, positionKey } from './LogWindow';
import { useChatStore } from '../stores/chatStore';
import { useOnlineStore, useMultiplayer } from '../net/online';

/**
 * 底部紀錄視窗（§ 32.3.1）：戰鬥紀錄與聊天合成一個視窗，以分頁切換。
 *
 * 兩者的產生速率差了兩個數量級，混成一串等於戰鬥把聊天洗掉，
 * 所以是分頁而不是同一份 log：各自的緩衝與捲動位置維持獨立。
 * 位置、透明度、三段高度沿用戰鬥紀錄原本的鍵，玩家的擺放不會因為合併而重置。
 */

export const LOG_KEY = 'combatLog' as const;

/** 合併前戰鬥紀錄就在用的鍵，沿用不遷移：玩家的位置與透明度不因合併而重置 */
export const POSITION_KEY = positionKey(LOG_KEY);
export const OPACITY_KEY = opacityKey(LOG_KEY);

export const LOG_TABS = ['combat', 'chat'] as const;
export type LogTab = (typeof LOG_TABS)[number];

export const LOG_TAB_LABELS: Record<LogTab, string> = { combat: '戰鬥紀錄', chat: '聊天' };

export function LogDock() {
  const online = useMultiplayer();
  const authed = useOnlineStore(s => s.status === 'authed');
  const unread = useChatStore(s => s.unread);
  const setPanelOpen = useChatStore(s => s.setPanelOpen);
  const [tab, setTab] = useState<LogTab>('combat');
  // 單機沒有聊天分頁；線上斷線時退回戰鬥分頁，才不會停在一個空白的分頁上
  const hasChat = online && authed;
  const active: LogTab = hasChat ? tab : 'combat';

  // 未讀只在聊天分頁沒顯示時累加（`chatStore` 以 `panelOpen` 判定）
  useEffect(() => {
    setPanelOpen(active === 'chat');
    return () => setPanelOpen(false);
  }, [active, setPanelOpen]);

  const tabs = hasChat ? (
    <div className="log-tabs" role="tablist" aria-label="紀錄分頁">
      {LOG_TABS.map(key => (
        <button
          key={key}
          className={`log-tab ${active === key ? 'active' : ''}`}
          role="tab"
          aria-selected={active === key}
          /* 標題列同時是拖曳握把，點分頁不該把視窗一起拖走 */
          onPointerDown={e => e.stopPropagation()}
          onClick={() => setTab(key)}
        >
          {LOG_TAB_LABELS[key]}
          {key === 'chat' && active !== 'chat' && unread > 0 && (
            <span className="quest-count-badge">{unread}</span>
          )}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    /* 手機改成貼在下方 HUD 帶上的抽屜（`47-mobile.md`）：全寬、不可拖曳 */
    <LogWindow
      storageKey={LOG_KEY}
      title={LOG_TAB_LABELS[active]}
      titleContent={tabs}
      /* 外框色相跟著分頁走（§ 34.10 分區色相） */
      className={active === 'chat' ? 'is-chat' : ''}
      drawerOnMobile
    >
      {() => (active === 'chat'
        ? <ChatPanelContent />
        : <CombatLogPanel className="bottom-log" emptyText="目前沒有戰鬥紀錄" />)}
    </LogWindow>
  );
}
