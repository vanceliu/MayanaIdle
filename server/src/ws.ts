/**
 * WebSocket 協定處理（`97-selfhosted-server.md` § 97.2 版本協商、§ 97.5 帳號）。
 * 每個連線一個 `PlayerSession`；client 只送指令，所有判定在 server。
 */
import type { WebSocketServer } from 'ws';
import type { GameRepository } from '../../client/src/db/repository';
import type { ClassName, Attributes } from '../../client/src/models/character';
import { AuthError, type AuthService } from './auth';
import { isLoopbackBind, type ServerConfig } from './config';
import { applyAutoMove, createPlayerSession, resetPatches, syncWorld, type PlayerSession } from './playerSession';
import { flush } from './tick';
import { ACTION_ALLOWLIST, type ClientMessage, type LeaderboardSnapshotView, type ServerMessage } from '../../client/src/net/protocol';
import { World } from './world';
import { log } from './log';

const CLASS_NAMES: ReadonlySet<string> = new Set(['knight', 'elf', 'elementalist', 'priest', 'thief']);

export interface GameServerDeps {
  repo: GameRepository;
  auth: AuthService;
  config: () => ServerConfig;
  version: string;
  hostUsername: string;
  /** 本服排行榜 snapshot（`37-statistics.md` § 37.4） */
  leaderboard: (top: number) => LeaderboardSnapshotView;
}

function isLoopbackAddress(address: string): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export class GameServer {
  readonly world = new World();
  readonly sessions: Set<PlayerSession>;
  private readonly deps: GameServerDeps;
  private closing = false;

  constructor(deps: GameServerDeps) {
    this.deps = deps;
    this.sessions = this.world.sessions;
  }

  attach(wss: WebSocketServer): void {
    wss.on('connection', (socket, req) => {
      if (this.closing) {
        socket.close(1013, 'shutting down');
        return;
      }
      const remote = req.socket.remoteAddress ?? '';
      const session = createPlayerSession(this.deps.repo, remote, msg => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
      });
      session.world = this.world;
      session.close = (code, reason) => socket.close(code, reason);
      this.sessions.add(session);
      log.info(`connection #${session.connectionId} from ${remote}`);

      socket.on('message', raw => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(raw.toString()) as ClientMessage;
        } catch {
          session.send({ t: 'error', code: 'bad_json', message: '訊息不是合法 JSON' });
          return;
        }
        void this.handle(session, socket, msg).catch(e => {
          const id = (msg as { id?: number }).id;
          if (e instanceof AuthError) {
            session.send({ t: 'error', code: e.code, message: e.message, id });
          } else {
            log.error(`connection #${session.connectionId} ${msg.t} failed`, e);
            session.send({ t: 'error', code: 'internal', message: (e as Error).message, id });
          }
        });
      });

      socket.on('close', () => {
        void this.detach(session);
      });
    });
  }

  onlineCount(): number {
    let n = 0;
    for (const s of this.sessions) if (s.userId !== null) n++;
    return n;
  }

  async detach(session: PlayerSession): Promise<void> {
    if (!this.sessions.has(session)) return;
    this.sessions.delete(session);
    try {
      if (session.game.getState().character) {
        this.world.onCharacterLeave(session);
        await session.game.getState().logout();
      }
    } catch (e) {
      log.error(`logout on close failed for #${session.connectionId}`, e);
    }
    log.info(`connection #${session.connectionId} closed`);
  }

  /** 踢除連線（§ 97.8 操作規則）：先強制 flush 該玩家 dirty state，再斷線 */
  async kick(session: PlayerSession, reason: string): Promise<void> {
    session.send({ t: 'kicked', reason });
    try {
      if (session.game.getState().character) {
        this.world.onCharacterLeave(session);
        await session.game.getState().logout();
      }
    } catch (e) {
      log.error(`kick flush failed for #${session.connectionId}`, e);
    }
    session.close(4000, reason);
  }

  /** 封鎖帳號時立即踢除該帳號的所有連線 */
  async kickUser(userId: number, reason: string): Promise<number> {
    const targets = [...this.sessions].filter(s => s.userId === userId);
    for (const s of targets) await this.kick(s, reason);
    return targets.length;
  }

  async shutdown(): Promise<void> {
    this.closing = true;
    for (const session of [...this.sessions]) {
      session.send({ t: 'kicked', reason: 'server shutdown' });
      await this.detach(session);
    }
  }

  private async handle(session: PlayerSession, socket: import('ws').WebSocket, msg: ClientMessage): Promise<void> {
    const config = this.deps.config();
    switch (msg.t) {
      case 'hello': {
        if (msg.version !== this.deps.version) {
          session.send({ t: 'version_mismatch', required: this.deps.version, received: msg.version });
          socket.close(4001, 'version mismatch');
          return;
        }
        let autoLogin: Extract<ServerMessage, { t: 'hello_ok' }>['autoLogin'];
        // 單機形態：bind 在 loopback 且來自本機的連線自動以 host 帳號登入（§ 97.5）
        if (isLoopbackBind(config.bind) && isLoopbackAddress(session.remoteAddress)) {
          const host = this.deps.auth.findByUsername(this.deps.hostUsername);
          if (host) {
            const token = this.deps.auth.issueSession(host.id);
            this.bindUser(session, host.id, host.username, token);
            autoLogin = { token, username: host.username, userId: host.id, isHost: true };
          }
        }
        session.send({ t: 'hello_ok', serverName: config.serverName, version: this.deps.version, registration: config.registration, autoLogin });
        return;
      }
      case 'register': {
        if (config.registration === 'closed') throw new AuthError('registration_closed', '本服未開放註冊');
        if (config.registration === 'invite' && (msg.inviteCode ?? '') !== config.inviteCode) throw new AuthError('bad_invite', '邀請碼錯誤');
        const user = await this.deps.auth.register(msg.username, msg.password);
        this.assertCapacity();
        const token = this.deps.auth.issueSession(user.id);
        this.bindUser(session, user.id, user.username, token);
        session.send({ t: 'auth_ok', token, username: user.username, userId: user.id, hasPassword: true, isHost: user.username === this.deps.hostUsername });
        return;
      }
      case 'login': {
        const user = await this.deps.auth.login(msg.username, msg.password);
        this.assertCapacity();
        const token = this.deps.auth.issueSession(user.id);
        this.bindUser(session, user.id, user.username, token);
        session.send({ t: 'auth_ok', token, username: user.username, userId: user.id, hasPassword: user.hasPassword, isHost: user.username === this.deps.hostUsername });
        return;
      }
      case 'resume': {
        const user = this.deps.auth.resolveSession(msg.token);
        if (!user) throw new AuthError('session_expired', '登入已過期');
        this.deps.auth.assertNotBanned(user);
        this.assertCapacity();
        this.bindUser(session, user.id, user.username, msg.token);
        session.send({ t: 'auth_ok', token: msg.token, username: user.username, userId: user.id, hasPassword: user.hasPassword, isHost: user.username === this.deps.hostUsername });
        return;
      }
      case 'set_password': {
        const userId = this.requireUser(session);
        // host 的密碼只能由 `server.properties` 決定（§ 97.5）
        if (session.username === this.deps.hostUsername) throw new AuthError('host_password_managed', 'host 帳號的密碼請改 server.properties 的 host-password');
        await this.deps.auth.setPassword(userId, msg.password);
        return;
      }
      case 'logout': {
        if (session.token) this.deps.auth.revokeSession(session.token);
        if (session.game.getState().character) {
          this.world.onCharacterLeave(session);
          await session.game.getState().logout();
        }
        session.userId = null;
        session.username = null;
        session.token = null;
        resetPatches(session);
        session.game.setState({ userId: null, characterList: [], phase: 'title' });
        flush(session, []);
        return;
      }
      case 'characters': {
        this.requireUser(session);
        await session.game.getState().loadCharacterList();
        flush(session, []);
        return;
      }
      case 'create_character': {
        this.requireUser(session);
        if (!CLASS_NAMES.has(msg.className)) throw new AuthError('bad_class', '職業不存在');
        // 角色名稱在本服唯一（`19-account-character.md` § 19.4）
        if (this.deps.repo.nameTaken(msg.name)) throw new AuthError('name_taken', `名稱「${msg.name}」已經有人用了`);
        await session.game.getState().createCharacter(msg.name, msg.className as ClassName, msg.bonusAttrs as unknown as Attributes, msg.appearance as never);
        await syncWorld(session);
        this.world.onCharacterEnter(session);
        this.world.syncPartyViews([session]);
        flush(session, []);
        return;
      }
      case 'select_character': {
        this.requireUser(session);
        const owned = (await this.deps.repo.getCharacter(msg.id))?.userId === session.userId;
        if (!owned) throw new AuthError('not_owner', '不是你的角色');
        await session.game.getState().selectCharacter(msg.id);
        await syncWorld(session);
        this.world.onCharacterEnter(session);
        this.world.syncPartyViews([session]);
        flush(session, []);
        return;
      }
      case 'delete_character': {
        this.requireUser(session);
        const owned = (await this.deps.repo.getCharacter(msg.id))?.userId === session.userId;
        if (!owned) throw new AuthError('not_owner', '不是你的角色');
        await session.game.getState().deleteCharacter(msg.id);
        await session.game.getState().loadCharacterList();
        flush(session, []);
        return;
      }
      case 'leave_character': {
        this.requireUser(session);
        if (session.game.getState().character) {
          this.world.onCharacterLeave(session);
          await session.game.getState().logout();
        }
        await syncWorld(session);
        await session.game.getState().loadCharacterList();
        flush(session, []);
        return;
      }
      case 'action': {
        this.requireUser(session);
        const allow = ACTION_ALLOWLIST[msg.store];
        if (!allow || !allow.has(msg.name)) throw new AuthError('action_denied', `不允許的操作 ${msg.store}.${msg.name}`);
        if (msg.store === 'party') {
          const result = await this.world.handlePartyAction(session, msg.name, msg.args ?? []);
          if (result.message) session.party.setState({ message: result.message });
          flush(session, []);
          if (msg.id !== undefined) session.send({ t: 'action_ok', id: msg.id, result: result.ok });
          return;
        }
        if (msg.store === 'trade') {
          const result = await this.world.handleTradeAction(session, msg.name, msg.args ?? []);
          if (result.message) session.trade.setState({ message: result.message });
          flush(session, []);
          if (msg.id !== undefined) session.send({ t: 'action_ok', id: msg.id, result: result.ok });
          return;
        }
        if (msg.store === 'chat') {
          const [channel, text, target] = msg.args ?? [];
          const result = this.world.handleChat(session, channel as never, text, target);
          if (msg.id !== undefined) {
            if (result.ok) session.send({ t: 'action_ok', id: msg.id, result: true });
            else session.send({ t: 'error', code: 'chat_rejected', message: result.message ?? '無法送出', id: msg.id });
          }
          return;
        }
        const store = session[msg.store];
        const fn = (store.getState() as unknown as Record<string, unknown>)[msg.name];
        if (typeof fn !== 'function') throw new AuthError('action_missing', `找不到操作 ${msg.store}.${msg.name}`);
        const result = await (fn as (...a: unknown[]) => unknown)(...(msg.args ?? []));
        await syncWorld(session);
        applyAutoMove(session);
        flush(session, []);
        if (msg.id !== undefined) session.send({ t: 'action_ok', id: msg.id, result: result === undefined ? null : result });
        return;
      }
      case 'leaderboard': {
        this.requireUser(session);
        const snapshot = this.deps.leaderboard(Math.min(100, Math.max(1, msg.top ?? 20)));
        session.send({ t: 'leaderboard', id: msg.id, snapshot });
        return;
      }
      default:
        session.send({ t: 'error', code: 'unknown_message', message: `未知訊息 ${(msg as { t: string }).t}` });
    }
  }

  private bindUser(session: PlayerSession, userId: number, username: string, token: string): void {
    session.userId = userId;
    session.username = username;
    session.token = token;
    session.game.setState({ userId });
  }

  private requireUser(session: PlayerSession): number {
    if (session.userId === null) throw new AuthError('unauthenticated', '請先登入');
    return session.userId;
  }

  private assertCapacity(): void {
    if (this.onlineCount() >= this.deps.config().maxPlayers) throw new AuthError('server_full', '本服已滿');
  }
}
