/** 系統信箱的 UI 狀態（`52-mailbox.md`）。發放與領取邏輯在 `systems/mailbox.ts` */
import { create } from 'zustand';
import type { Mail } from '../models/mailbox';
import {
  claimAll as claimAllMail,
  claimMail,
  deleteClaimedMail,
  listMail,
  purgeClaimedMail,
  unclaimedCount,
} from '../systems/mailbox';

export interface MailboxState {
  characterId: number | null;
  mails: Mail[];
  /** 未領封數。徽章只算這個（§ 52.5） */
  unread: number;

  load: (characterId: number) => Promise<void>;
  refresh: () => Promise<void>;
  claim: (mailId: number) => Promise<boolean>;
  claimAll: () => Promise<number>;
  /** 刪一封已領取的信。未領取的刪不掉（§ 52.4） */
  remove: (mailId: number) => Promise<boolean>;
  /** 清掉全部已領取的信 */
  purgeClaimed: () => Promise<number>;
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

  remove: async mailId => {
    const ok = await deleteClaimedMail(mailId);
    if (ok) await get().refresh();
    return ok;
  },

  purgeClaimed: async () => {
    const { characterId } = get();
    if (characterId === null) return 0;
    const n = await purgeClaimedMail(characterId);
    if (n > 0) await get().refresh();
    return n;
  },

  reset: () => set({ characterId: null, mails: [], unread: 0 }),
}));
