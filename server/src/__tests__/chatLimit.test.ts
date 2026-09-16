import { describe, it, expect } from 'vitest';
import {
  chatTextLength,
  CHAT_MAX_LENGTH,
  ChatLimiter,
  CHAT_RATE_MAX,
  CHAT_RATE_WINDOW_MS,
  MUTE_MS,
  MUTE_ESCALATE_AFTER,
  MUTE_ESCALATE_WINDOW_MS,
  LONG_MUTE_MS,
} from '../chatLimit';

/**
 * 公開頻道的發話頻率與禁言（`97-selfhosted-server.md` § 97.7.2）。
 *
 * 10 秒內超過 5 則禁言 1 分鐘；5 分鐘內超過 3 次禁言，第 4 次起禁 30 分鐘。
 * 時間一律由呼叫端傳入，測試才不必等真的時間過去。
 */
const CHAR = 1;

/**
 * 連送 n 則，回傳「哪一則被擋下」的索引（沒有就是 -1）。
 *
 * 預設**同一個時間點**送完：禁言的起點就等於 `startAt`，
 * 後面的期滿斷言才不必再扣掉這一串的間隔。
 */
function sendBurst(limiter: ChatLimiter, n: number, startAt: number, gapMs = 0): number {
  for (let i = 0; i < n; i++) {
    if (limiter.record(CHAR, startAt + i * gapMs)) return i;
  }
  return -1;
}

/**
 * 字數一律以**碼位**計（§ 97.7.2）：英文字母、標點、中日文各算 1 字，
 * 不因全形半形而不同。表情符號的代理對也算 1 字，不會被當成 2 字。
 */
describe('訊息字數', () => {
  it('英文、標點、中日文都是一字一字', () => {
    expect(chatTextLength('abc')).toBe(3);
    expect(chatTextLength('Hello, 世界。')).toBe(10);
    expect(chatTextLength('，。！？')).toBe(4);
    expect(chatTextLength(',.!?')).toBe(4);
  });

  it('表情符號算一字，不是兩字', () => {
    expect(chatTextLength('🙂')).toBe(1);
    expect('🙂'.length).toBe(2);
  });

  it('上限是 50 字', () => {
    expect(CHAT_MAX_LENGTH).toBe(50);
    expect(chatTextLength('a'.repeat(CHAT_MAX_LENGTH))).toBe(CHAT_MAX_LENGTH);
  });
});

describe('聊天頻率限制', () => {
  it(`視窗內剛好 ${CHAT_RATE_MAX} 則不觸發`, () => {
    const limiter = new ChatLimiter();
    expect(sendBurst(limiter, CHAT_RATE_MAX, 1000)).toBe(-1);
    expect(limiter.isMuted(CHAR, 1000)).toBe(false);
  });

  it('第 6 則觸發禁言，該則本身也被擋下', () => {
    const limiter = new ChatLimiter();
    expect(sendBurst(limiter, CHAT_RATE_MAX + 1, 1000)).toBe(CHAT_RATE_MAX);
    expect(limiter.isMuted(CHAR, 1000)).toBe(true);
  });

  it('禁言 1 分鐘，期滿即恢復', () => {
    const limiter = new ChatLimiter();
    sendBurst(limiter, CHAT_RATE_MAX + 1, 1000);

    expect(limiter.isMuted(CHAR, 1000 + MUTE_MS - 1)).toBe(true);
    expect(limiter.isMuted(CHAR, 1000 + MUTE_MS + 1)).toBe(false);
  });

  it('發話散在視窗之外就不會累積', () => {
    const limiter = new ChatLimiter();
    // 每則間隔超過整個視窗，永遠只有一則在視窗內
    expect(sendBurst(limiter, 20, 1000, CHAT_RATE_WINDOW_MS + 1)).toBe(-1);
  });

  it(`5 分鐘內第 ${MUTE_ESCALATE_AFTER + 1} 次禁言改為 30 分鐘`, () => {
    const limiter = new ChatLimiter();
    let at = 1000;
    // 前三次：各禁 1 分鐘
    for (let i = 0; i < MUTE_ESCALATE_AFTER; i++) {
      sendBurst(limiter, CHAT_RATE_MAX + 1, at);
      expect(limiter.isMuted(CHAR, at + MUTE_MS - 1)).toBe(true);
      expect(limiter.isMuted(CHAR, at + MUTE_MS + 1)).toBe(false);
      at += MUTE_MS + 1000;
    }

    // 第四次：30 分鐘
    sendBurst(limiter, CHAT_RATE_MAX + 1, at);
    expect(limiter.isMuted(CHAR, at + MUTE_MS + 1)).toBe(true);
    expect(limiter.isMuted(CHAR, at + LONG_MUTE_MS - 1)).toBe(true);
    expect(limiter.isMuted(CHAR, at + LONG_MUTE_MS + 1)).toBe(false);
  });

  it('累犯視窗外的舊禁言不算數', () => {
    const limiter = new ChatLimiter();
    let at = 1000;
    for (let i = 0; i < MUTE_ESCALATE_AFTER; i++) {
      sendBurst(limiter, CHAT_RATE_MAX + 1, at);
      at += MUTE_ESCALATE_WINDOW_MS + 1000;
    }

    // 前三次都已超出累犯視窗，這次仍算第一次
    sendBurst(limiter, CHAT_RATE_MAX + 1, at);
    expect(limiter.isMuted(CHAR, at + MUTE_MS + 1)).toBe(false);
  });

  it('解禁之後計數重來，不會一發話就再被禁', () => {
    const limiter = new ChatLimiter();
    sendBurst(limiter, CHAT_RATE_MAX + 1, 1000);
    const after = 1000 + MUTE_MS + 1;

    expect(limiter.record(CHAR, after)).toBe(false);
  });

  it('管理介面可手動禁言與解除，手動禁言不計入累犯', () => {
    const limiter = new ChatLimiter();
    limiter.mute(CHAR, 5000);
    expect(limiter.isMuted(CHAR, 4999)).toBe(true);
    expect(limiter.mutedUntil(CHAR, 4999)).toBe(5000);

    limiter.unmute(CHAR);
    expect(limiter.isMuted(CHAR, 4999)).toBe(false);
    expect(limiter.mutedUntil(CHAR, 4999)).toBe(0);

    // 手動禁言沒有累積次數，自動判定仍從第一次算起
    sendBurst(limiter, CHAT_RATE_MAX + 1, 6000);
    expect(limiter.isMuted(CHAR, 6000 + MUTE_MS + 1)).toBe(false);
  });

  it('角色離線後清掉計數', () => {
    const limiter = new ChatLimiter();
    sendBurst(limiter, CHAT_RATE_MAX + 1, 1000);
    limiter.forget(CHAR);

    expect(limiter.isMuted(CHAR, 1000)).toBe(false);
  });
});
