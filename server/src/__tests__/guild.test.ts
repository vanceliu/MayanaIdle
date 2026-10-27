import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { SqliteGuildStorage } from '../db/guildStorage';
import { GuildManager } from '../guild';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { World } from '../world';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer, SOLO_NO_GUILD_MESSAGE } from '../ws';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';

/** 公會（`11-guild.md`） */
const ATTRS = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never;

describe('公會', () => {
  let world: World;
  let repo: SqliteRepository;
  let db: DatabaseSync;
  const sent = new Map<number, ServerMessage[]>();

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    world = new World(new SqliteGuildStorage(db));
    sent.clear();
  });

  async function enter(userId: number, name: string, opts: { level?: number; cha?: number; region?: string } = {}): Promise<PlayerSession> {
    const s = createPlayerSession(repo, '127.0.0.1', m => {
      const list = sent.get(s.connectionId) ?? [];
      list.push(m);
      sent.set(s.connectionId, list);
    });
    s.world = world;
    s.userId = userId;
    s.game.setState({ userId });
    world.sessions.add(s);
    await s.game.getState().createCharacter(name, 'knight', ATTRS);
    const ch = s.game.getState().character!;
    const region = opts.region ?? 'neutral-town';
    s.game.setState({
      character: {
        ...ch,
        level: opts.level ?? 10,
        currentRegion: region,
        currentArea: region,
        baseAttributes: { ...ch.baseAttributes, CHA: opts.cha ?? 12 },
      },
    });
    await s.game.getState().saveState();
    await syncWorld(s);
    world.onCharacterEnter(s);
    return s;
  }

  const idOf = (s: PlayerSession) => s.game.getState().character!.id!;
  const act = (s: PlayerSession, name: string, ...args: unknown[]) => world.handleGuildAction(s, name, args);
  const logs = (s: PlayerSession) => s.game.getState().combatLogs.map(l => l.text);

  async function inviteAndAccept(leader: PlayerSession, member: PlayerSession) {
    expect((await act(leader, 'invite', idOf(member))).ok).toBe(true);
    const invite = member.guild.getState().invites[0];
    expect((await act(member, 'accept', invite.id)).ok).toBe(true);
  }

  describe('建立（§ 11.3、§ 11.4）', () => {
    it('Lv10、無公會、在城鎮即可建立，建立者成為盟主', async () => {
      const a = await enter(1, 'Alice');
      const r = await act(a, 'create', '星辰');
      expect(r.ok).toBe(true);
      const view = a.guild.getState().guild!;
      expect(view.name).toBe('星辰');
      expect(view.leaderId).toBe(idOf(a));
      expect(view.capacity).toBe(24);
    });

    it('未滿 Lv10 不可建立', async () => {
      const a = await enter(1, 'Alice', { level: 9 });
      const r = await act(a, 'create', '星辰');
      expect(r).toEqual({ ok: false, message: '需要等級 10 才能建立公會' });
    });

    it('不在城鎮不可建立', async () => {
      const a = await enter(1, 'Alice', { region: 'dawn-plains' });
      expect((await act(a, 'create', '星辰')).ok).toBe(false);
      expect(a.guild.getState().guild).toBeNull();
    });

    it('名稱寬 2~12（中文 2、其餘 1）、字元同角色名', async () => {
      const a = await enter(1, 'Alice');
      expect((await act(a, 'create', 'A')).message).toBe('公會名稱至少 1 個中文或 2 個英數字');
      expect((await act(a, 'create', '七個字的公會名')).message).toBe('公會名稱最多 6 個中文或 12 個英數字（中文算 2 格）');
      expect((await act(a, 'create', 'ABCDEFGHIJKLM')).ok).toBe(false);
      expect((await act(a, 'create', '有 空白')).ok).toBe(false);
      expect((await act(a, 'create', '---')).ok).toBe(false);
      expect((await act(a, 'create', '六個字公會名')).ok).toBe(true);
      const b = await enter(2, 'Bob');
      expect((await act(b, 'create', 'ABCDEFGHIJKL')).ok).toBe(true);
    });

    it('名稱本服唯一，不分大小寫', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      expect((await act(a, 'create', 'Star')).ok).toBe(true);
      expect((await act(b, 'create', 'star')).message).toBe('公會名稱「star」已經有人用了');
    });

    it('已有公會（含盟主）不可再建立', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      await act(a, 'create', '星辰');
      await inviteAndAccept(a, b);
      expect((await act(a, 'create', '月光')).message).toBe('你已有公會');
      expect((await act(b, 'create', '月光')).message).toBe('你已有公會');
    });
  });

  describe('邀請與加入（§ 11.5、§ 11.6）', () => {
    it('只有盟主能邀請；成員邀請被拒', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      await act(a, 'create', '星辰');
      await inviteAndAccept(a, b);
      expect((await act(b, 'invite', idOf(c))).message).toBe('只有盟主可以這麼做');
    });

    it('可用角色名稱邀請，大小寫不分', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      await act(a, 'create', '星辰');
      expect((await act(a, 'invite', 'bob')).ok).toBe(true);
      expect(b.guild.getState().invites[0]).toMatchObject({ guildName: '星辰', fromName: 'Alice' });
    });

    it('已有公會者不可被邀請，也不可接受其他公會的邀請', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      await act(a, 'create', '星辰');
      await act(b, 'create', '月光');
      expect((await act(a, 'invite', idOf(b))).message).toBe('Bob 已有公會');

      // 先收到兩份邀請，加入其中一個之後另一份不能再接受
      await act(a, 'invite', idOf(c));
      await act(b, 'invite', idOf(c));
      const [first, second] = c.guild.getState().invites;
      expect((await act(c, 'accept', first.id)).ok).toBe(true);
      expect((await act(c, 'accept', second.id)).message).toBe('你已有公會');
    });

    it('人數上限＝盟主魅力（含裝備）× 2，含盟主', async () => {
      const a = await enter(1, 'Alice', { cha: 1 });
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      await act(a, 'create', '星辰');
      expect(a.guild.getState().guild!.capacity).toBe(2);
      await inviteAndAccept(a, b);
      expect((await act(a, 'invite', idOf(c))).message).toBe('公會人數已達上限');
    });

    it('上限低於現有人數時成員保留，只是不能再邀人', async () => {
      const a = await enter(1, 'Alice', { cha: 2 });
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      const d = await enter(4, 'Dave');
      await act(a, 'create', '星辰');
      await inviteAndAccept(a, b);
      await inviteAndAccept(a, c);

      const ch = a.game.getState().character!;
      a.game.setState({ character: { ...ch, baseAttributes: { ...ch.baseAttributes, CHA: 1 } } });
      world.syncGuildViews([a]);

      expect(a.guild.getState().guild!.members).toHaveLength(3);
      expect(a.guild.getState().guild!.capacity).toBe(2);
      expect((await act(a, 'invite', idOf(d))).message).toBe('公會人數已達上限');
    });

    it('接受當下人數已滿則加入失敗', async () => {
      const a = await enter(1, 'Alice', { cha: 1 });
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      await act(a, 'create', '星辰');
      await act(a, 'invite', idOf(b));
      await act(a, 'invite', idOf(c));
      await act(b, 'accept', b.guild.getState().invites[0].id);
      expect((await act(c, 'accept', c.guild.getState().invites[0].id)).message).toBe('公會人數已達上限');
    });

    it('邀請 60 秒逾期', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      await act(a, 'create', '星辰');
      await act(a, 'invite', idOf(b));
      const invite = b.guild.getState().invites[0];
      vi.spyOn(Date, 'now').mockReturnValue(invite.expiresAt + 1);
      try {
        expect((await act(b, 'accept', invite.id)).message).toBe('邀請已失效');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('拒絕邀請會通知盟主', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      await act(a, 'create', '星辰');
      await act(a, 'invite', idOf(b));
      await act(b, 'decline', b.guild.getState().invites[0].id);
      expect(b.guild.getState().invites).toEqual([]);
      expect(logs(a)).toContain('Bob 拒絕了你的公會邀請');
    });
  });

  describe('退出、踢人、解散（§ 11.6）', () => {
    it('成員可退出，退出後可立即再加入', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      await act(a, 'create', '星辰');
      await inviteAndAccept(a, b);
      expect((await act(b, 'leave')).ok).toBe(true);
      expect(b.guild.getState().guild).toBeNull();
      await inviteAndAccept(a, b);
      expect(b.guild.getState().guild!.name).toBe('星辰');
    });

    it('盟主不可退出', async () => {
      const a = await enter(1, 'Alice');
      await act(a, 'create', '星辰');
      expect((await act(a, 'leave')).message).toBe('盟主不能退出，只能解散公會');
    });

    it('只有盟主可踢人，被踢者收到通知', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      await act(a, 'create', '星辰');
      await inviteAndAccept(a, b);
      await inviteAndAccept(a, c);
      expect((await act(b, 'kick', idOf(c))).message).toBe('只有盟主可以這麼做');
      expect((await act(a, 'kick', idOf(c))).ok).toBe(true);
      expect(c.guild.getState().guild).toBeNull();
      expect(logs(c)).toContain('你已被移出公會「星辰」');
    });

    it('解散後全體成員變為無公會，名稱立即釋放', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      await act(a, 'create', '星辰');
      await inviteAndAccept(a, b);
      expect((await act(b, 'disband')).message).toBe('只有盟主可以這麼做');
      expect((await act(a, 'disband')).ok).toBe(true);
      expect(a.guild.getState().guild).toBeNull();
      expect(b.guild.getState().guild).toBeNull();
      expect(logs(b)).toContain('公會「星辰」已解散');
      expect((await act(b, 'create', '星辰')).ok).toBe(true);
    });

    it('刪除角色：成員移出；盟主則公會解散', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      await act(a, 'create', '星辰');
      await inviteAndAccept(a, b);
      await inviteAndAccept(a, c);

      await world.onCharacterDeleted(idOf(c));
      expect(a.guild.getState().guild!.members.map(m => m.name)).toEqual(['Alice', 'Bob']);

      await world.onCharacterDeleted(idOf(a));
      expect(b.guild.getState().guild).toBeNull();
      expect(world.guilds.guilds.size).toBe(0);
    });
  });

  describe('顯示與頻道（§ 11.7、`97-selfhosted-server.md` § 97.7.2）', () => {
    it('盟主第一列，其餘在線優先、再依加入時間；離線成員保留最後等級', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      await act(a, 'create', '星辰');
      await inviteAndAccept(a, b);
      await inviteAndAccept(a, c);

      world.onCharacterLeave(b);
      world.sessions.delete(b);
      world.syncGuildViews([a]);
      const members = a.guild.getState().guild!.members;
      expect(members.map(m => [m.name, m.online])).toEqual([['Alice', true], ['Carol', true], ['Bob', false]]);
      expect(members[2].level).toBe(10);
    });

    it('在線名單附公會名稱；無公會不帶', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      await act(a, 'create', '星辰');
      world.syncPartyViews([b]);
      const row = b.party.getState().onMap.find(p => p.name === 'Alice')!;
      expect(row.guildName).toBe('星辰');
      world.syncPartyViews([a]);
      expect(a.party.getState().onMap.find(p => p.name === 'Bob')!.guildName).toBeUndefined();
    });

    it('隊友資料帶公會名稱，供懸停名稱顯示', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      await act(a, 'create', '星辰');
      expect((await world.handlePartyAction(a, 'invite', [idOf(b)])).ok).toBe(true);
      expect((await world.handlePartyAction(b, 'accept', [b.party.getState().invites[0].id])).ok).toBe(true);
      for (const s of [a, b]) {
        const ch = s.game.getState().character!;
        s.game.setState({ character: { ...ch, currentRegion: 'dawn-plains', currentArea: 'dawn-plains' } });
        await syncWorld(s);
      }
      world.tick();
      expect(b.party.getState().teammates.find(t => t.name === 'Alice')?.guildName).toBe('星辰');
      expect(a.party.getState().teammates.find(t => t.name === 'Bob')?.guildName).toBeUndefined();
    });

    it('公會頻道只有同公會的在線成員收到', async () => {
      const a = await enter(1, 'Alice');
      const b = await enter(2, 'Bob');
      const c = await enter(3, 'Carol');
      expect(world.handleChat(a, 'guild', '哈囉')).toEqual({ ok: false, message: '尚無公會' });
      await act(a, 'create', '星辰');
      await inviteAndAccept(a, b);
      expect(world.handleChat(a, 'guild', '哈囉').ok).toBe(true);
      const chats = (s: PlayerSession) => (sent.get(s.connectionId) ?? []).filter(m => m.t === 'chat');
      expect(chats(a)).toHaveLength(1);
      expect(chats(b)).toHaveLength(1);
      expect(chats(c)).toHaveLength(0);
    });
  });

  it('別人的存檔交易開著後回滾，公會寫入不被帶走', async () => {
    const a = await enter(1, 'Alice');
    let release!: () => void;
    const held = new Promise<void>(r => { release = r; });
    const failing = repo.transaction(async () => {
      await repo.putCharacterPrefs(999, { x: 1 });
      await held;
      throw new Error('存檔失敗');
    });
    const creating = act(a, 'create', '星辰');
    release();
    await expect(failing).rejects.toThrow('存檔失敗');
    expect((await creating).ok).toBe(true);
    expect(db.prepare('SELECT name FROM guilds').all()).toEqual([{ name: '星辰' }]);
    expect(world.guilds.guildOf(idOf(a))?.name).toBe('星辰');
  });

  it('兩人同時接受邀請搶最後一個名額，只有一人加入', async () => {
    const a = await enter(1, 'Alice', { cha: 1 });
    const b = await enter(2, 'Bob');
    const c = await enter(3, 'Carol');
    await act(a, 'create', '星辰');
    await act(a, 'invite', idOf(b));
    await act(a, 'invite', idOf(c));
    const [rb, rc] = await Promise.all([
      act(b, 'accept', b.guild.getState().invites[0].id),
      act(c, 'accept', c.guild.getState().invites[0].id),
    ]);
    expect([rb.ok, rc.ok].filter(Boolean)).toHaveLength(1);
    expect(world.guilds.guildOf(idOf(a))!.members.size).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS n FROM guild_members').get()).toEqual({ n: 2 });
  });

  it('重開 server 後公會、成員與盟主魅力從 SQLite 還原', async () => {
    const a = await enter(1, 'Alice', { cha: 3 });
    const b = await enter(2, 'Bob');
    await act(a, 'create', '星辰');
    await inviteAndAccept(a, b);

    const reloaded = new GuildManager(new SqliteGuildStorage(db));
    const guild = reloaded.guildOf(idOf(b))!;
    expect(guild.name).toBe('星辰');
    expect(guild.leaderId).toBe(idOf(a));
    expect(reloaded.capacity(guild)).toBe(6);
    expect([...guild.members.keys()].sort()).toEqual([idOf(a), idOf(b)].sort());
  });
});

describe('公會：單機世界', () => {
  it('單機世界的公會操作一律拒絕（`97-selfhosted-server.md` § 97.1）', async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    const auth = new AuthService(db);
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    const server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'solo', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    let fire!: (socket: unknown, req: unknown) => void;
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);

    const user = await auth.register('alice', 'password1');
    const handlers: Record<string, (raw: unknown) => void> = {};
    const out: ServerMessage[] = [];
    fire({
      readyState: 1, OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { out.push(JSON.parse(raw) as ServerMessage); },
      close() {},
    }, { socket: { remoteAddress: '1.2.3.4' } });
    const session = [...server.sessions].at(-1)!;
    const send = (msg: unknown) => handlers.message(JSON.stringify(msg));
    send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    send({ t: 'resume', token: await auth.issueSession(user.id) });
    send({ t: 'create_character', name: 'Alice', className: 'knight', bonusAttrs: { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 } });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe('Alice'));

    send({ t: 'action', store: 'guild', name: 'create', args: ['星辰'], id: 1 });
    await vi.waitFor(() => expect(out.some(m => 'id' in m && m.id === 1)).toBe(true));
    expect(out.find(m => 'id' in m && m.id === 1)).toMatchObject({ t: 'action_ok', result: false });
    expect(session.guild.getState().message).toBe(SOLO_NO_GUILD_MESSAGE);
    expect(server.world.guilds.guilds.size).toBe(0);
  });
});
