/** 系統信箱的 UI 狀態（`52-mailbox.md`）。發放與領取邏輯在 `systems/mailbox.ts` */
import { create } from 'zustand';
import type { Mail } from '../models/mailbox';
import {
  claimAll as claimAllMail,
  claimMail,
  deleteClaimedMail,
  isOwnMail,
  listMail,
  MAIL_BAG_FULL_MESSAGE,
  purgeClaimedMail,
  unclaimedCount,
} from '../systems/mailbox';
import { defaultSession, type Session } from './session';

export interface MailboxState {
  characterId: number | null;
  mails: Mail[];
  /** 未領封數。徽章只算這個（§ 52.5） */
  unread: number;
  /** 上一次領取的結果訊息（背包放不下時） */
  message: string | null;

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

export function createMailboxStore(session: Session) {
  return create<MailboxState>((set, get) => {
  /** 領到的天賦格進背包「天賦」分頁，未安裝（§ 52.3） */
  async function afterClaim(characterId: number) {
    await get().refresh();
    await session.talent.getState().load(characterId);
  }

  return {
  characterId: null,
  mails: [],
  unread: 0,
  message: null,

  load: async characterId => {
    const mails = await listMail(characterId, session.repo);
    set({ characterId, mails, unread: unclaimedCount(mails) });
  },

  refresh: async () => {
    const { characterId } = get();
    if (characterId === null) return;
    await get().load(characterId);
  },

  claim: async mailId => {
    const { characterId } = get();
    if (characterId === null || !(await isOwnMail(mailId, characterId, session.repo))) return false;
    const result = await claimMail(mailId, session);
    set({ message: result === 'bag_full' ? MAIL_BAG_FULL_MESSAGE : null });
    if (result === 'claimed') await afterClaim(characterId);
    return result === 'claimed';
  },

  claimAll: async () => {
    const { characterId } = get();
    if (characterId === null) return 0;
    const { claimed, blocked } = await claimAllMail(characterId, session);
    set({ message: blocked > 0 ? MAIL_BAG_FULL_MESSAGE : null });
    if (claimed > 0) await afterClaim(characterId);
    return claimed;
  },

  remove: async mailId => {
    const { characterId } = get();
    if (characterId === null || !(await isOwnMail(mailId, characterId, session.repo))) return false;
    const ok = await deleteClaimedMail(mailId, session.repo);
    if (ok) await get().refresh();
    return ok;
  },

  purgeClaimed: async () => {
    const { characterId } = get();
    if (characterId === null) return 0;
    const n = await purgeClaimedMail(characterId, session.repo);
    if (n > 0) await get().refresh();
    return n;
  },

  reset: () => set({ characterId: null, mails: [], unread: 0, message: null }),
  };
  });
}

export const useMailboxStore = createMailboxStore(defaultSession);
defaultSession.mailbox = useMailboxStore;
