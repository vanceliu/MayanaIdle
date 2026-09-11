/**
 * server 公告（`97-selfhosted-server.md` § 97.8）。
 *
 * 關服倒數這類全服訊息不走聊天頻道 —— 聊天會被別人的訊息推走，
 * 而「60 秒後關閉」錯過了就等於沒通知。橫幅停在畫面上方直到下一則或過期。
 */
import { create } from 'zustand';

/** 一則公告停留多久（ms）。關服倒數的間隔最短 1 秒，停久一點才不會閃 */
export const NOTICE_DURATION_MS = 8000;

interface NoticeState {
  text: string | null;
  /** 到期時間（`Date.now()` 基準），用來讓橫幅自己收掉 */
  until: number;
  show: (text: string, durationMs?: number) => void;
  clear: () => void;
}

export const useNoticeStore = create<NoticeState>(set => ({
  text: null,
  until: 0,
  show: (text, durationMs = NOTICE_DURATION_MS) =>
    set({ text, until: Date.now() + durationMs }),
  clear: () => set({ text: null, until: 0 }),
}));
