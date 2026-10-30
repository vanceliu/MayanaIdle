/**
 * 與 server 的 WebSocket 連線：版本協商、登入、指令送出、斷線重連。
 * 收到的狀態一律交給 `mirror.ts` 套進 store。
 */
import { PROTOCOL_VERSION } from './protocol';
import { BUILD_INFO } from '../buildInfo';
import type { ClientMessage, ServerMessage, ActionStore, LeaderboardSnapshotView } from './protocol';
import { useOnlineStore, readSessionToken, writeSessionToken } from './online';
import { applyServerMessage } from './mirror';
import { defaultSession } from '../stores/session';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/** 連線未開啟時送出的請求 */
export const NOT_CONNECTED_MESSAGE = '尚未連線，操作未送出';
/** 等待回應期間斷線 */
export const DISCONNECTED_MESSAGE = '連線中斷，操作結果未知';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export class GameConnection {
  private socket: WebSocket | null = null;
  private url: string | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private reconnectDelay = RECONNECT_BASE_MS;
  private closedByUser = false;
  /** 斷線前遊戲中的角色，重連登入後自動選回（§ 97.5 斷線重連） */
  private rejoinCharacterId: number | null = null;
  /** 自動選回已送出、尚未收到結果 */
  private rejoinPending = false;
  /** 已離開起始畫面（按「進入」或以表單登入）；為 false 時自動登入停在起始畫面（`19-account-character.md` § 19.3） */
  private entered = false;

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
    return this.request(id => ({ t: 'action', id, store, name, args }));
  }

  /** 設定視窗改密碼（§ 97.5）；失敗以錯誤訊息 reject */
  async setPassword(current: string, password: string): Promise<void> {
    await this.request(id => ({ t: 'set_password', id, current, password }));
  }

  /** 設定視窗產生救援碼（§ 97.5）；新碼經 `recovery_code` 進 store */
  async regenerateRecoveryCode(current: string): Promise<void> {
    await this.request(id => ({ t: 'regenerate_recovery_code', id, current }));
  }

  /** 連線未開啟時立即以 `NOT_CONNECTED_MESSAGE` 失敗，不登記等待（§ 97.2） */
  private request(build: (id: number) => ClientMessage): Promise<unknown> {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error(NOT_CONNECTED_MESSAGE));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send(build(id));
    });
  }

  /** 本服排行榜 snapshot（`37-statistics.md` § 37.4） */
  requestLeaderboard(top = 20): Promise<LeaderboardSnapshotView> {
    return this.request(id => ({ t: 'leaderboard', id, top })) as Promise<LeaderboardSnapshotView>;
  }

  login(username: string, password: string): void {
    this.entered = true;
    useOnlineStore.setState({ error: null });
    this.send({ t: 'login', username, password });
  }

  recover(code: string, password: string): void {
    this.entered = true;
    useOnlineStore.setState({ error: null });
    this.send({ t: 'recover', code, password });
  }

  register(username: string, password: string, inviteCode?: string): void {
    this.entered = true;
    useOnlineStore.setState({ error: null });
    this.send({ t: 'register', username, password, inviteCode });
  }

  logout(): void {
    this.rejoinCharacterId = null;
    this.entered = false;
    this.send({ t: 'logout' });
    writeSessionToken(null);
    useOnlineStore.setState({ status: 'login', username: null, userId: null, hasRecoveryCode: false, recoveryCode: null, awaitingEnter: false });
  }

  /** 起始畫面的「進入」 */
  enterFromTitle(): void {
    this.entered = true;
    this.enterAfterAuth();
  }

  private open(): void {
    if (!this.url) return;
    useOnlineStore.setState({ status: 'connecting', wsUrl: this.url, error: null });
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.reconnectDelay = RECONNECT_BASE_MS;
      // 協定版本與發布版本都送，server 兩個都比（§ 97.2）
      this.send({ t: 'hello', version: PROTOCOL_VERSION, release: BUILD_INFO.version });
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
      for (const p of this.pending.values()) p.reject(new Error(DISCONNECTED_MESSAGE));
      this.pending.clear();
      useOnlineStore.setState({ latencyMs: null });
      const st = useOnlineStore.getState();
      if (this.closedByUser || st.status === 'version_mismatch') return;
      this.rejoinCharacterId = st.kickedReason ? null : defaultSession.game.getState().character?.id ?? null;
      useOnlineStore.setState({ status: 'disconnected' });
      setTimeout(() => this.open(), this.reconnectDelay);
      this.reconnectDelay = Math.min(RECONNECT_MAX_MS, this.reconnectDelay * 2);
    };
  }

  /** 登入後：尚未離開起始畫面就停著等「進入」，否則照 `enterAfterAuth` 往下走 */
  private afterAuth(): void {
    if (this.entered) this.enterAfterAuth();
    else useOnlineStore.setState({ awaitingEnter: true });
  }

  /** 有斷線前的角色就直接選回，否則進角色選擇 */
  private enterAfterAuth(): void {
    useOnlineStore.setState({ awaitingEnter: false });
    const id = this.rejoinCharacterId;
    this.rejoinCharacterId = null;
    this.rejoinPending = id !== null;
    this.send(id !== null ? { t: 'select_character', id } : { t: 'characters' });
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'hello_ok': {
        useOnlineStore.setState({ serverName: msg.serverName, serverVersion: msg.version, registration: msg.registration, worldMode: msg.mode });
        if (msg.autoLogin) {
          writeSessionToken(msg.autoLogin.token);
          useOnlineStore.setState({ status: 'authed', username: msg.autoLogin.username, userId: msg.autoLogin.userId, hasPassword: false, hasRecoveryCode: false, isHost: msg.autoLogin.isHost });
          this.afterAuth();
          return;
        }
        const token = readSessionToken();
        if (token) this.send({ t: 'resume', token });
        else useOnlineStore.setState({ status: 'login' });
        return;
      }
      case 'version_mismatch':
        useOnlineStore.setState({ status: 'version_mismatch', mismatchKind: msg.kind, requiredVersion: msg.required });
        return;
      case 'auth_ok':
        writeSessionToken(msg.token);
        useOnlineStore.setState({
          status: 'authed', username: msg.username, userId: msg.userId, hasPassword: msg.hasPassword, hasRecoveryCode: msg.hasRecoveryCode, isHost: msg.isHost, error: null,
          ...(msg.recoveryCode ? { recoveryCode: msg.recoveryCode } : {}),
        });
        this.afterAuth();
        return;
      case 'recovery_code':
        useOnlineStore.setState({ recoveryCode: msg.code, hasRecoveryCode: true });
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
          this.rejoinCharacterId = null;
          this.entered = false;
          // 改密碼撤銷了這條 session 時，回登入表單要看得到原因（§ 97.5）
          useOnlineStore.setState({ status: 'login', error: useOnlineStore.getState().kickedReason, kickedReason: null, awaitingEnter: false });
          return;
        }
        if (this.rejoinPending) {
          this.rejoinPending = false;
          this.send({ t: 'characters' });
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
      case 'latency':
        useOnlineStore.setState({ latencyMs: msg.ms });
        return;
      case 'kicked':
        useOnlineStore.setState({ error: msg.reason, kickedReason: msg.reason });
        return;
      default:
        if (msg.t === 'frame') this.rejoinPending = false;
        applyServerMessage(msg);
    }
  }
}

export const connection = new GameConnection();
