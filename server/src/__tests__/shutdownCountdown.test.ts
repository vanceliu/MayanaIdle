import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameServer, shutdownNotice } from '../ws';
import { SHUTDOWN_ANNOUNCE_AT, SHUTDOWN_COUNTDOWN_SECONDS } from '../shutdown';
import type { PlayerSession } from '../playerSession';
import type { ServerMessage } from '../../../client/src/net/protocol';

/**
 * 關服倒數（`97-selfhosted-server.md` § 97.8）：
 * 按下 graceful shutdown 之後要給在線玩家時間自己收尾 ——
 * 沒有預告就斷線，正在打王或交易的人直接斷在半路。
 */
function fakeServer() {
  const sent: ServerMessage[] = [];
  const server = new GameServer({
    repo: {} as never,
    auth: {} as never,
    config: () => ({}) as never,
    version: 'test',
    hostUsername: 'host',
    mode: 'open',
    leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }),
  });
  server.sessions.add({ send: (m: ServerMessage) => sent.push(m) } as unknown as PlayerSession);
  return { server, sent };
}

const notices = (sent: ServerMessage[]) =>
  sent.filter((m): m is Extract<ServerMessage, { t: 'notice' }> => m.t === 'notice').map(m => m.text);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('關服倒數', () => {
  it('按下去立刻廣播第一則，時間到才真的關', () => {
    const { server, sent } = fakeServer();
    const onExpire = vi.fn();

    server.beginShutdown(SHUTDOWN_COUNTDOWN_SECONDS, SHUTDOWN_ANNOUNCE_AT, onExpire);

    expect(notices(sent)).toEqual([shutdownNotice(SHUTDOWN_COUNTDOWN_SECONDS)]);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SHUTDOWN_COUNTDOWN_SECONDS * 1000 - 1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('每個時點各廣播一次剩餘秒數，順序由多到少', () => {
    const { server, sent } = fakeServer();

    server.beginShutdown(SHUTDOWN_COUNTDOWN_SECONDS, SHUTDOWN_ANNOUNCE_AT, () => {});
    vi.advanceTimersByTime(SHUTDOWN_COUNTDOWN_SECONDS * 1000);

    expect(notices(sent)).toEqual(
      [SHUTDOWN_COUNTDOWN_SECONDS, ...SHUTDOWN_ANNOUNCE_AT].map(shutdownNotice),
    );
  });

  it('倒數期間加入的連線也收得到後續公告', () => {
    const { server, sent } = fakeServer();
    server.beginShutdown(SHUTDOWN_COUNTDOWN_SECONDS, [10], () => {});

    const late: ServerMessage[] = [];
    server.sessions.add({ send: (m: ServerMessage) => late.push(m) } as unknown as PlayerSession);
    vi.advanceTimersByTime(SHUTDOWN_COUNTDOWN_SECONDS * 1000);

    expect(notices(late)).toEqual([shutdownNotice(10)]);
    expect(notices(sent)).toEqual([SHUTDOWN_COUNTDOWN_SECONDS, 10].map(shutdownNotice));
  });

  it('不可取消 —— 重複按不會把倒數重來一次', () => {
    const { server, sent } = fakeServer();
    const onExpire = vi.fn();

    server.beginShutdown(SHUTDOWN_COUNTDOWN_SECONDS, [10], onExpire);
    vi.advanceTimersByTime(30_000);
    server.beginShutdown(SHUTDOWN_COUNTDOWN_SECONDS, [10], onExpire);

    // 第二次完全沒有效果：沒有新公告，也沒有第二個到期計時
    expect(notices(sent)).toEqual([shutdownNotice(SHUTDOWN_COUNTDOWN_SECONDS)]);
    vi.advanceTimersByTime(SHUTDOWN_COUNTDOWN_SECONDS * 1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('倒數開始就拒新連線（`closing`）', () => {
    const { server } = fakeServer();
    const closed: number[] = [];
    const wss = {
      on: (_event: string, handler: (socket: unknown, req: unknown) => void) => {
        (wss as { fire?: unknown }).fire = handler;
      },
    } as never as import('ws').WebSocketServer & { fire: (socket: unknown, req: unknown) => void };
    server.attach(wss);

    server.beginShutdown(SHUTDOWN_COUNTDOWN_SECONDS, [], () => {});
    wss.fire({ close: (code: number) => closed.push(code) }, { socket: { remoteAddress: '1.2.3.4' } });

    expect(closed).toEqual([1013]);
  });

  it('公告文案帶得出剩餘秒數', () => {
    expect(shutdownNotice(60)).toContain('60 秒');
    expect(shutdownNotice(1)).toContain('1 秒');
  });
});
