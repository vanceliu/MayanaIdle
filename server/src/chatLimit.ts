import { CHAT_MAX_LENGTH } from '../../client/src/net/protocol';

/**
 * 公開頻道的發話頻率限制與禁言（`97-selfhosted-server.md` § 97.7.2）。
 *
 * 只擋世界與城鎮：騷擾發生在公開頻道，隊伍與密語是小範圍溝通，被禁言時
 * 還要能跟隊友交代一聲。
 *
 * **只存記憶體**：server 重啟即清。禁言最長 30 分鐘，為了它加一張表與遷移不划算。
 */

/** 發話計數的滾動視窗 */
export const CHAT_RATE_WINDOW_MS = 10_000;
/** 視窗內**超過**這個則數即觸發禁言（第 6 則） */
export const CHAT_RATE_MAX = 5;
/** 一般禁言長度 */
export const MUTE_MS = 60_000;
/** 累犯判定的滾動視窗 */
export const MUTE_ESCALATE_WINDOW_MS = 5 * 60_000;
/** 視窗內**超過**這個次數即加重（第 4 次） */
export const MUTE_ESCALATE_AFTER = 3;
/** 加重後的禁言長度。第 5 次以後維持同一個長度，不再往上疊 */
export const LONG_MUTE_MS = 30 * 60_000;

/** 單條訊息的字數上限（§ 97.7.2）。定義在協定檔，client 的輸入框讀同一個 */
export { CHAT_MAX_LENGTH };

/** 超過字數上限時回給玩家的字 */
export const TOO_LONG_MESSAGE = `單條訊息最多 ${CHAT_MAX_LENGTH} 字`;

/** 訊息長度（碼位）。`text.length` 會把表情符號算成 2，不可直接用 */
export function chatTextLength(text: string): number {
  return [...text].length;
}

/** 被擋下時回給玩家的字。不報剩餘秒數 */
export const MUTED_MESSAGE = '禁言中，無法發話';

interface LimitState {
  /** 視窗內的發話時間 */
  sends: number[];
  /** 視窗內的禁言時間，用來判累犯 */
  mutes: number[];
  mutedUntil: number;
}

function prune(times: number[], now: number, windowMs: number): number[] {
  const from = now - windowMs;
  return times.filter(t => t > from);
}

export class ChatLimiter {
  private readonly byCharacter = new Map<number, LimitState>();

  private stateOf(characterId: number): LimitState {
    let state = this.byCharacter.get(characterId);
    if (!state) {
      state = { sends: [], mutes: [], mutedUntil: 0 };
      this.byCharacter.set(characterId, state);
    }
    return state;
  }

  isMuted(characterId: number, now: number): boolean {
    return this.stateOf(characterId).mutedUntil > now;
  }

  /** 禁言到什麼時候（管理介面顯示用）；沒被禁回 0 */
  mutedUntil(characterId: number, now: number): number {
    const until = this.stateOf(characterId).mutedUntil;
    return until > now ? until : 0;
  }

  /**
   * 記一次公開頻道發言。
   * 回傳 true 代表這一則**超出限制**：該則不送出，並已進入禁言。
   */
  record(characterId: number, now: number): boolean {
    const state = this.stateOf(characterId);
    state.sends = prune(state.sends, now, CHAT_RATE_WINDOW_MS);
    state.sends.push(now);
    if (state.sends.length <= CHAT_RATE_MAX) return false;

    state.mutes = prune(state.mutes, now, MUTE_ESCALATE_WINDOW_MS);
    state.mutes.push(now);
    const repeat = state.mutes.length > MUTE_ESCALATE_AFTER;
    state.mutedUntil = now + (repeat ? LONG_MUTE_MS : MUTE_MS);
    // 禁言後計數歸零：解禁的瞬間不該因為視窗裡還留著舊紀錄而立刻再犯
    state.sends = [];
    return true;
  }

  /** 管理介面手動禁言（§ 97.8）。不計入累犯次數 —— 那是自動判定的事 */
  mute(characterId: number, until: number): void {
    this.stateOf(characterId).mutedUntil = until;
  }

  unmute(characterId: number): void {
    const state = this.stateOf(characterId);
    state.mutedUntil = 0;
    state.sends = [];
  }

  /** 角色離線後清掉，避免長期累積 */
  forget(characterId: number): void {
    this.byCharacter.delete(characterId);
  }
}
