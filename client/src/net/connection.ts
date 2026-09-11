/**
 * 與 server 的 WebSocket 連線：版本協商、登入、指令送出、斷線重連。
 * 收到的狀態一律交給 `mirror.ts` 套進 store。
 */
import { BUILD_INFO } from '../buildInfo';
import type { ClientMessage, ServerMessage, ActionStore, LeaderboardSnapshotView } from './protocol';
import { useOnlineStore, readSessionToken, writeSessionToken } from './online';
import { applyServerMessage } from './mirror';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export class GameConnection {
  private socket: WebSocket | null = null;
  private url: string | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private reconnectDelay = RECONNECT_BASE_MS;
  private closedByUser = false;

  connect(url: string): void {
    this.url = url;
    this.closedByUser = false;
    this.open();
  }

  disconnect(): void {
    this.closedByUser = true;
    this.socket?.close();
    this.socket = null;
  }

  send(msg: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  /** 送 action 並等 server 回 `action_ok`；錯誤以 `error` 回來 */
  rpc(store: ActionStore, name: string, args: unknown[]): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ t: 'action', id, store, name, args });
    });
  }

  /** 本服排行榜 snapshot（`37-statistics.md` § 37.4） */
  requestLeaderboard(top = 20): Promise<LeaderboardSnapshotView> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: v => resolve(v as LeaderboardSnapshotView), reject });
      this.send({ t: 'leaderboard', id, top });
    });
  }

  login(username: string, password: string): void {
    useOnlineStore.setState({ error: null });
    this.send({ t: 'login', username, password });
  }

  register(username: string, password: string, inviteCode?: string): void {
    useOnlineStore.setState({ error: null });
    this.send({ t: 'register', username, password, inviteCode });
  }

  logout(): void {
    this.send({ t: 'logout' });
    writeSessionToken(null);
    useOnlineStore.setState({ status: 'login', username: null, userId: null });
  }

  private open(): void {
    if (!this.url) return;
    useOnlineStore.setState({ status: 'connecting', wsUrl: this.url, error: null });
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectDelay = RECONNECT_BASE_MS;
      this.send({ t: 'hello', version: BUILD_INFO.version });
    };
    socket.onmessage = ev => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(msg);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      for (const p of this.pending.values()) p.reject(new Error('disconnected'));
      this.pending.clear();
      const st = useOnlineStore.getState();
      if (this.closedByUser || st.status === 'version_mismatch') return;
      useOnlineStore.setState({ status: 'disconnected' });
      setTimeout(() => this.open(), this.reconnectDelay);
      this.reconnectDelay = Math.min(RECONNECT_MAX_MS, this.reconnectDelay * 2);
    };
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'hello_ok': {
        useOnlineStore.setState({ serverName: msg.serverName, serverVersion: msg.version, registration: msg.registration, worldMode: msg.mode });
        if (msg.autoLogin) {
          writeSessionToken(msg.autoLogin.token);
          useOnlineStore.setState({ status: 'authed', username: msg.autoLogin.username, userId: msg.autoLogin.userId, hasPassword: false, isHost: msg.autoLogin.isHost });
          this.send({ t: 'characters' });
          return;
        }
        const token = readSessionToken();
        if (token) this.send({ t: 'resume', token });
        else useOnlineStore.setState({ status: 'login' });
        return;
      }
      case 'version_mismatch':
        useOnlineStore.setState({ status: 'version_mismatch', requiredVersion: msg.required });
        return;
      case 'auth_ok':
        writeSessionToken(msg.token);
        useOnlineStore.setState({ status: 'authed', username: msg.username, userId: msg.userId, hasPassword: msg.hasPassword, isHost: msg.isHost, error: null });
        this.send({ t: 'characters' });
        return;
      case 'error': {
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            p.reject(new Error(msg.message));
          }
          return;
        }
        if (msg.code === 'session_expired') {
          writeSessionToken(null);
          useOnlineStore.setState({ status: 'login', error: null });
          return;
        }
        useOnlineStore.setState({ error: msg.message });
        return;
      }
      case 'action_ok': {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          p.resolve(msg.result);
        }
        return;
      }
      case 'leaderboard': {
        if (msg.id === undefined) return;
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          p.resolve(msg.snapshot);
        }
        return;
      }
      case 'kicked':
        useOnlineStore.setState({ error: msg.reason });
        return;
      default:
        applyServerMessage(msg);
    }
  }
}

export const connection = new GameConnection();
