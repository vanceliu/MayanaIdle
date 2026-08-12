/**
 * 系統信箱的 UI 狀態（`52-mailbox.md`）。
 *
 * 發放與領取的邏輯在 `systems/mailbox.ts`；這裡只持有列表與未領封數，
 * 讓 `PanelDock` 的徽章不必每次重繪都打 DB。
 */
import { create } from 'zustand';
import type { Mail } from '../models/mailbox';
import {
  claimAll as claimAllMail,
  claimMail,
  listMail,
  unclaimedCount,
} from '../systems/mailbox';

export interface MailboxState {
  characterId: number | null;
  mails: Mail[];
  /** 未領封數。徽章只算這個 —— 指示器掛在「領取」上，不掛「安裝」（§ 52.5） */
  unread: number;

  load: (characterId: number) => Promise<void>;
  refresh: () => Promise<void>;
  claim: (mailId: number) => Promise<boolean>;
  claimAll: () => Promise<number>;
  reset: () => void;
}

export const useMailboxStore = create<MailboxState>((set, get) => ({
  characterId: null,
  mails: [],
  unread: 0,

  load: async characterId => {
    const mails = await listMail(characterId);
    set({ characterId, mails, unread: unclaimedCount(mails) });
  },

  refresh: async () => {
    const { characterId } = get();
    if (characterId === null) return;
    await get().load(characterId);
  },

  claim: async mailId => {
    const ok = await claimMail(mailId);
    if (ok) await get().refresh();
    return ok;
  },

  claimAll: async () => {
    const { characterId } = get();
    if (characterId === null) return 0;
    const n = await claimAllMail(characterId);
    if (n > 0) await get().refresh();
    return n;
  },

  reset: () => set({ characterId: null, mails: [], unread: 0 }),
}));
