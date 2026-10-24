import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameConnection } from '../connection';
import { useOnlineStore } from '../online';
import type { ClientMessage, ServerMessage } from '../protocol';
import { defaultSession } from '../../stores/session';
import type { Character } from '../../models/character';

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor() {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  serverOpens(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const HELLO_HOST: ServerMessage = {
  t: 'hello_ok', version: '3', serverName: 's', registration: 'open', mode: 'solo',
  autoLogin: { token: 't', username: 'host', userId: 1, isHost: true },
};
const AUTH_OK: ServerMessage = { t: 'auth_ok', token: 't', username: 'u', userId: 1, hasPassword: true, hasRecoveryCode: true, isHost: false };

function latestSocket(): FakeSocket {
  return FakeSocket.instances[FakeSocket.instances.length - 1];
}

function enterWorld(conn: GameConnection): FakeSocket {
  conn.connect('ws://test/ws');
  const socket = latestSocket();
  socket.serverOpens();
  socket.receive(HELLO_HOST);
  return socket;
}

/** 斷線後等重連計時器觸發，回傳新連線（已完成 hello） */
function dropAndReconnect(socket: FakeSocket): FakeSocket {
  socket.close();
  vi.advanceTimersByTime(1000);
  const next = latestSocket();
  expect(next).not.toBe(socket);
  next.serverOpens();
  return next;
}

function sentAfterHello(socket: FakeSocket): ClientMessage[] {
  return socket.sent.filter(m => m.t !== 'hello');
}

/** `97-selfhosted-server.md` § 97.5 斷線重連 */
describe('斷線重連回到原角色', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.instances = [];
    useOnlineStore.setState({ status: 'offline', error: null, kickedReason: null });
    defaultSession.game.setState({ character: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('遊戲中斷線，重連登入後直接選回該角色', () => {
    const conn = new GameConnection();
    const first = enterWorld(conn);
    defaultSession.game.setState({ character: { id: 7 } as Character });

    const second = dropAndReconnect(first);
    second.receive(HELLO_HOST);

    expect(sentAfterHello(second)).toEqual([{ t: 'select_character', id: 7 }]);
    conn.disconnect();
  });

  it('auth_ok（session 續用）同樣選回', () => {
    const conn = new GameConnection();
    const first = enterWorld(conn);
    defaultSession.game.setState({ character: { id: 3 } as Character });

    const second = dropAndReconnect(first);
    second.receive(AUTH_OK);

    expect(sentAfterHello(second)).toEqual([{ t: 'select_character', id: 3 }]);
    conn.disconnect();
  });

  it('停在角色選擇時斷線，重連後照舊進角色選擇', () => {
    const conn = new GameConnection();
    const first = enterWorld(conn);

    const second = dropAndReconnect(first);
    second.receive(HELLO_HOST);

    expect(sentAfterHello(second)).toEqual([{ t: 'characters' }]);
    conn.disconnect();
  });

  it('被踢除後的重連不選回', () => {
    const conn = new GameConnection();
    const first = enterWorld(conn);
    defaultSession.game.setState({ character: { id: 7 } as Character });
    first.receive({ t: 'kicked', reason: '此帳號已在其他地方進入遊戲' });

    const second = dropAndReconnect(first);
    second.receive(HELLO_HOST);

    expect(sentAfterHello(second)).toEqual([{ t: 'characters' }]);
    conn.disconnect();
  });

  it('選角失敗時改進角色選擇，不顯示錯誤', () => {
    const conn = new GameConnection();
    const first = enterWorld(conn);
    defaultSession.game.setState({ character: { id: 7 } as Character });

    const second = dropAndReconnect(first);
    second.receive(HELLO_HOST);
    second.receive({ t: 'error', code: 'not_owner', message: '不是你的角色' });

    expect(sentAfterHello(second)).toEqual([{ t: 'select_character', id: 7 }, { t: 'characters' }]);
    expect(useOnlineStore.getState().error).toBeNull();
    conn.disconnect();
  });

  it('選回成功後的錯誤照常顯示', () => {
    const conn = new GameConnection();
    const first = enterWorld(conn);
    defaultSession.game.setState({ character: { id: 7 } as Character });

    const second = dropAndReconnect(first);
    second.receive(HELLO_HOST);
    second.receive({ t: 'frame', stores: {} });
    second.receive({ t: 'error', code: 'x', message: '其他錯誤' });

    expect(sentAfterHello(second)).toEqual([{ t: 'select_character', id: 7 }]);
    expect(useOnlineStore.getState().error).toBe('其他錯誤');
    conn.disconnect();
  });

  it('登出後再登入不選回', () => {
    const conn = new GameConnection();
    const first = enterWorld(conn);
    defaultSession.game.setState({ character: { id: 7 } as Character });

    const second = dropAndReconnect(first);
    conn.logout();
    second.receive(AUTH_OK);

    expect(sentAfterHello(second)).toEqual([{ t: 'logout' }, { t: 'characters' }]);
    conn.disconnect();
  });

  it('登入過期後手動登入不選回', () => {
    const conn = new GameConnection();
    const first = enterWorld(conn);
    defaultSession.game.setState({ character: { id: 7 } as Character });

    const second = dropAndReconnect(first);
    second.receive({ t: 'error', code: 'session_expired', message: '登入已過期' });
    second.receive(AUTH_OK);

    expect(sentAfterHello(second)).toEqual([{ t: 'characters' }]);
    conn.disconnect();
  });
});
