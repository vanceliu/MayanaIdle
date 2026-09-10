/**
 * 全服世界（`97-selfhosted-server.md` § 97.7）：所有 session、隊伍、地圖實例，與每 tick 的推進。
 * session 進出地圖時由 `playerSession.ts` 回呼 `place`／`remove`。
 */
import { TICK_MS } from '../../client/src/core/clock';
import { tickWorld } from '../../client/src/systems/worldTick';
import type { CombatVisual } from '../../client/src/systems/combatLoop';
import { memberIdOf, presentMembers, type MapInstance } from '../../client/src/systems/mapInstance';
import type {
  OnMapPlayerView, PartyInviteView, PartyMemberView, PartyView, TeammateView,
} from '../../client/src/stores/partyStore';
import type { Session } from '../../client/src/stores/session';
import { getEffectiveMaxHp, getEffectiveMaxMp } from '../../client/src/stores/gameStore';
import { InstanceManager, instanceKey } from './instances';
import { PartyError, PartyManager, type MemberIdentity, type Party } from './party';
import { TradeError, TradeManager, type Trade } from './trade';
import type { ChatChannel, ChatMessageView } from '../../client/src/net/protocol';
import { getRegion } from '../../client/src/models/mapData';
import type { PlayerSession } from './playerSession';

export interface PartyActionResult {
  ok: boolean;
  message?: string;
}

export class World {
  readonly sessions = new Set<PlayerSession>();
  readonly parties = new PartyManager();
  readonly instances = new InstanceManager();
  readonly trades = new TradeManager();
  private nextChatId = 1;
  private readonly tradeSignature = new WeakMap<PlayerSession, string>();
  /** 上一次送出的隊伍面板快照簽章，變了才 setState */
  private readonly partySignature = new WeakMap<PlayerSession, string>();
  /**
   * 各人「邀請被回絕過、因此已經知道對方有隊伍」的角色（§ 97.7.1）。
   * 名單本身不透露隊籍，邀出去被擋才知道 —— 沒邀過就看得到誰有隊伍等於白送情報。
   */
  private readonly knownInParty = new WeakMap<PlayerSession, Set<number>>();

  // ---------- 查詢 ----------

  sessionOf(characterId: number): PlayerSession | undefined {
    for (const s of this.sessions) if (s.game.getState().character?.id === characterId) return s;
    return undefined;
  }

  identityOf(session: Session): MemberIdentity | null {
    const ch = session.game.getState().character;
    if (!ch?.id) return null;
    return { characterId: ch.id, name: ch.name, className: ch.className };
  }

  partyKeyOf(session: Session): string {
    const id = memberIdOf(session);
    const party = this.parties.partyOf(id);
    return party ? `party:${party.id}` : `solo:${id}`;
  }

  // ---------- 進出地圖 ----------

  /** 角色所在地圖與隊籍決定實例鍵；`reason` 為 party 時切入既有隊伍實例要在入口重生 */
  place(session: PlayerSession, reason: 'map' | 'party'): void {
    const ch = session.game.getState().character;
    if (!ch || !session.mapControl.getState().currentMap) return;
    const key = instanceKey(this.partyKeyOf(session), ch.currentRegion, ch.currentFloor);
    const existing = this.instances.get(key);
    const respawn = reason === 'party' && !!existing && existing !== session.instance;
    const instance = this.instances.place(session, key, respawn);
    this.bindPartyHook(instance);
  }

  remove(session: PlayerSession): void {
    this.instances.release(session);
  }

  /** 選角進入世界：回線自動回到隊伍（§ 97.7.3） */
  onCharacterEnter(session: PlayerSession): void {
    const identity = this.identityOf(session);
    if (identity) this.parties.setOnline(identity.characterId, true, identity);
  }

  onCharacterLeave(session: PlayerSession): void {
    const identity = this.identityOf(session);
    if (identity) {
      this.parties.setOnline(identity.characterId, false);
      const dropped = this.trades.dropCharacter(identity.characterId);
      if (dropped) this.syncTradeViews(this.tradeSessions(dropped));
    }
    this.remove(session);
    session.party.setState({ party: null, invites: [], teammates: [], onMap: [] });
    session.trade.setState({ trade: null, offers: [], message: null });
    this.partySignature.delete(session);
    this.tradeSignature.delete(session);
    this.knownInParty.delete(session);
  }

  // ---------- 聊天（§ 97.7.2） ----------

  /**
   * 以角色名稱找在線的人；密語與組隊邀請共用。
   * 名稱在本服唯一（`19-account-character.md` § 19.4），比對忽略大小寫。
   */
  findOnlineByName(raw: unknown): PlayerSession | null {
    const name = String(raw ?? '').trim().normalize('NFC').toLowerCase();
    if (!name) return null;
    for (const s of this.sessions) {
      const other = s.game.getState().character?.name;
      if (other && other.normalize('NFC').toLowerCase() === name) return s;
    }
    return null;
  }

  /** 密語對象：沒填與查無此人分開回報，玩家才知道是打錯還是對方不在 */
  private findChatTarget(raw: unknown): { session: PlayerSession } | { error: string } {
    const name = String(raw ?? '').trim();
    if (!name) return { error: '請先填密語對象' };
    const session = this.findOnlineByName(name);
    if (!session) return { error: `找不到「${name}」，或對方不在線上` };
    return { session };
  }

  /** 依頻道路由；公會頻道沒有公會資料可查，一律拒絕 */
  handleChat(session: PlayerSession, channel: ChatChannel, rawText: unknown, rawTarget?: unknown): PartyActionResult {
    const me = this.identityOf(session);
    if (!me) return { ok: false, message: '尚未進入世界' };
    const text = String(rawText ?? '').trim();
    if (!text) return { ok: false, message: '訊息不可為空' };
    const ch = session.game.getState().character!;
    let recipients: PlayerSession[];
    let to: { characterId: number; name: string } | undefined;
    switch (channel) {
      case 'world':
        recipients = [...this.sessions].filter(s => s.game.getState().character);
        break;
      case 'party': {
        const party = this.parties.partyOf(me.characterId);
        if (!party) return { ok: false, message: '尚未組隊' };
        recipients = [];
        for (const id of party.members.keys()) {
          const s = this.sessionOf(id);
          if (s) recipients.push(s);
        }
        break;
      }
      case 'town': {
        if (getRegion(ch.currentRegion)?.type !== 'town') return { ok: false, message: '不在城鎮內' };
        recipients = [...this.sessions].filter(s => s.game.getState().character?.currentRegion === ch.currentRegion);
        break;
      }
      case 'guild':
        return { ok: false, message: '尚無公會' };
      case 'whisper': {
        const found = this.findChatTarget(rawTarget);
        if ('error' in found) return { ok: false, message: found.error };
        const target = found.session;
        const identity = this.identityOf(target);
        if (!identity) return { ok: false, message: '對方尚未進入世界' };
        if (identity.characterId === me.characterId) return { ok: false, message: '不能密語自己' };
        to = { characterId: identity.characterId, name: identity.name };
        // 兩邊都要收到：發話者要看得到自己送出去的那一句
        recipients = [target, session];
        break;
      }
      default:
        return { ok: false, message: '未知的頻道' };
    }
    const message: ChatMessageView = {
      id: this.nextChatId++,
      channel,
      from: { characterId: me.characterId, name: me.name },
      ...(to ? { to } : {}),
      text,
      at: Date.now(),
    };
    for (const s of recipients) s.send({ t: 'chat', message });
    return { ok: true };
  }

  // ---------- 交易（§ 97.7 表） ----------

  private tradeSessions(trade: Trade): PlayerSession[] {
    return [trade.a.session, trade.b.session] as PlayerSession[];
  }

  async handleTradeAction(session: PlayerSession, name: string, args: unknown[]): Promise<PartyActionResult> {
    const me = this.identityOf(session);
    if (!me) return { ok: false, message: '尚未進入世界' };
    const now = Date.now();
    const affected = new Set<PlayerSession>([session]);
    try {
      switch (name) {
        case 'offer': {
          const target = this.sessionOf(Number(args[0]));
          if (!target) throw new TradeError('target_offline', '對方不在線上');
          this.trades.offer(session, target, now);
          affected.add(target);
          return { ok: true, message: `已向 ${target.game.getState().character!.name} 提出交易` };
        }
        case 'accept': {
          const trade = this.trades.accept(String(args[0]), session, now);
          for (const s of this.tradeSessions(trade)) affected.add(s);
          return { ok: true };
        }
        case 'decline':
          this.trades.decline(String(args[0]), me.characterId);
          return { ok: true };
        case 'setOffer': {
          const trade = this.trades.setOffer(me.characterId, (args[0] ?? {}) as never);
          for (const s of this.tradeSessions(trade)) affected.add(s);
          return { ok: true };
        }
        case 'lock': {
          const trade = this.trades.lock(me.characterId);
          for (const s of this.tradeSessions(trade)) affected.add(s);
          return { ok: true };
        }
        case 'confirm': {
          const current = this.trades.tradeOf(me.characterId);
          if (current) for (const s of this.tradeSessions(current)) affected.add(s);
          const { completed } = await this.trades.confirm(me.characterId);
          if (completed && current) {
            for (const s of this.tradeSessions(current)) {
              const other = s === current.a.session ? current.b : current.a;
              s.game.getState().pushSystemLog(`與 ${other.name} 的交易完成`);
              s.trade.setState({ message: '交易完成' });
            }
          }
          return { ok: true };
        }
        case 'cancel': {
          const trade = this.trades.cancel(me.characterId);
          if (trade) {
            for (const s of this.tradeSessions(trade)) {
              affected.add(s);
              if (s !== session) s.trade.setState({ message: `${me.name} 取消了交易` });
            }
          }
          return { ok: true };
        }
        default:
          return { ok: false, message: `未知的交易操作 ${name}` };
      }
    } catch (e) {
      if (e instanceof TradeError) return { ok: false, message: e.message };
      throw e;
    } finally {
      this.syncTradeViews([...affected]);
    }
  }

  syncTradeViews(targets: PlayerSession[]): void {
    const now = Date.now();
    for (const s of targets) {
      const ch = s.game.getState().character;
      if (!ch?.id) continue;
      const trade = this.trades.tradeOf(ch.id);
      const view = trade ? this.trades.view(trade, ch.id) : null;
      const offers = this.trades.offersFor(ch.id, now);
      const signature = JSON.stringify([view, offers]);
      if (this.tradeSignature.get(s) === signature) continue;
      this.tradeSignature.set(s, signature);
      s.trade.setState({ trade: view, offers });
    }
  }

  private bindPartyHook(instance: MapInstance): void {
    if (!instance.key.startsWith('party:')) {
      instance.party = null;
      return;
    }
    const partyId = instance.key.slice('party:'.length, instance.key.indexOf('|'));
    instance.party = {
      dropMode: () => this.parties.parties.get(partyId)?.dropMode ?? 'participants',
      onlineMembers: () => {
        const party = this.parties.parties.get(partyId);
        if (!party) return [];
        const out: Session[] = [];
        for (const id of party.members.keys()) {
          const s = this.sessionOf(id);
          if (s && s.game.getState().character) out.push(s);
        }
        return out;
      },
    };
  }

  /** 隊籍變動後把受影響的人放到正確的實例 */
  private replaceAll(reason: 'map' | 'party'): void {
    for (const s of this.sessions) {
      if (!s.game.getState().character || !s.mapControl.getState().currentMap) continue;
      const ch = s.game.getState().character!;
      const key = instanceKey(this.partyKeyOf(s), ch.currentRegion, ch.currentFloor);
      if (s.instance?.key !== key) this.place(s, reason);
    }
    this.instances.prune();
  }

  // ---------- 隊伍操作（§ 97.7.3） ----------

  async handlePartyAction(session: PlayerSession, name: string, args: unknown[]): Promise<PartyActionResult> {
    const me = this.identityOf(session);
    if (!me) return { ok: false, message: '尚未進入世界' };
    const now = Date.now();
    // 解散會清空成員表，受影響的人要在變動前記下
    const before = this.parties.partyOf(me.characterId);
    const beforeIds = before ? [...before.members.keys()] : [];
    try {
      switch (name) {
        case 'invite': {
          // 名單上點的傳角色 id，手動輸入的傳角色名稱，兩種都收（§ 97.7.3）
          const raw = args[0];
          const byName = typeof raw === 'string' && !/^\d+$/.test(raw.trim());
          const target = byName ? this.findOnlineByName(raw) : this.sessionOf(Number(raw));
          const identity = target ? this.identityOf(target) : null;
          if (!identity) {
            throw new PartyError('target_offline', byName ? `找不到「${String(raw).trim()}」，或對方不在線上` : '對方不在線上');
          }
          this.parties.invite(me, identity, now);
          this.syncPartyViews([target!]);
          return { ok: true, message: `已邀請 ${identity.name}` };
        }
        case 'accept': {
          const party = this.parties.accept(String(args[0]), me, id => {
            const s = this.sessionOf(id);
            return s ? this.identityOf(s) : null;
          }, now);
          this.afterPartyChange(party);
          return { ok: true };
        }
        case 'decline':
          this.parties.decline(String(args[0]), me.characterId);
          return { ok: true };
        case 'leave': {
          const party = this.parties.leave(me.characterId);
          if (party) this.afterPartyChange(party, beforeIds, [me.characterId]);
          return { ok: true };
        }
        case 'kick': {
          const targetId = Number(args[0]);
          const party = this.parties.kick(me.characterId, targetId);
          this.afterPartyChange(party, beforeIds, [targetId]);
          return { ok: true };
        }
        case 'transferLeader': {
          const party = this.parties.transferLeader(me.characterId, Number(args[0]));
          this.afterPartyChange(party);
          return { ok: true };
        }
        case 'setDropMode': {
          const party = this.parties.setDropMode(me.characterId, args[0] as never);
          this.afterPartyChange(party);
          return { ok: true };
        }
        default:
          return { ok: false, message: `未知的隊伍操作 ${name}` };
      }
    } catch (e) {
      if (e instanceof PartyError) {
        if (e.code === 'target_in_party' && typeof e.targetCharacterId === 'number') {
          let known = this.knownInParty.get(session);
          if (!known) this.knownInParty.set(session, (known = new Set()));
          known.add(e.targetCharacterId);
        }
        return { ok: false, message: e.message };
      }
      throw e;
    } finally {
      this.syncPartyViews([session]);
    }
  }

  /** 離隊者先離開實例，留下的人才能沿用原實例（只剩自己時直接改鍵） */
  private afterPartyChange(party: Party, extraCharacterIds: number[] = [], leaverIds: number[] = []): void {
    for (const id of leaverIds) {
      const s = this.sessionOf(id);
      if (s) this.instances.release(s);
    }
    this.replaceAll('party');
    const affected = new Set<PlayerSession>();
    for (const id of [...party.members.keys(), ...extraCharacterIds]) {
      const s = this.sessionOf(id);
      if (s) affected.add(s);
    }
    this.syncPartyViews([...affected]);
  }

  // ---------- 每 tick ----------

  tick(): Map<Session, CombatVisual[]> {
    this.replaceAll('map');
    const visuals = tickWorld(TICK_MS, this.sessions, this.instances.all());
    this.instances.prune();
    this.syncPartyViews([...this.sessions]);
    this.syncTradeViews([...this.sessions]);
    return visuals;
  }

  /** 隊伍面板、邀請、隊友位置、同圖名單的快照 */
  syncPartyViews(targets: PlayerSession[]): void {
    const now = Date.now();
    for (const s of targets) {
      const ch = s.game.getState().character;
      if (!ch?.id) continue;
      const party = this.parties.partyOf(ch.id);
      const view = party ? this.partyView(party) : null;
      const invites: PartyInviteView[] = this.parties.invitesFor(ch.id, now).map(i => ({
        id: i.id, partyId: i.partyId ?? '', fromCharacterId: i.fromCharacterId, fromName: i.fromName, expiresAt: i.expiresAt,
      }));
      const onMap = this.onMapView(s, ch.currentRegion, ch.currentFloor);
      const signature = JSON.stringify([view, invites, onMap]);
      const teammates = this.teammatesView(s);
      const patch: Record<string, unknown> = {};
      if (this.partySignature.get(s) !== signature) {
        this.partySignature.set(s, signature);
        patch.party = view;
        patch.invites = invites;
        patch.onMap = onMap;
      }
      const prev = s.party.getState().teammates;
      if (teammates.length > 0 || prev.length > 0) patch.teammates = teammates;
      if (Object.keys(patch).length > 0) s.party.setState(patch);
    }
  }

  private partyView(party: Party): PartyView {
    const members: PartyMemberView[] = [];
    for (const m of party.members.values()) {
      const s = this.sessionOf(m.characterId);
      const gs = s?.game.getState();
      const ch = gs?.character;
      members.push({
        characterId: m.characterId,
        name: m.name,
        className: m.className,
        level: ch?.level ?? 0,
        hp: ch?.hp ?? 0,
        maxHp: ch && gs ? getEffectiveMaxHp(ch, gs.equippedGear) : 0,
        mp: ch?.mp ?? 0,
        maxMp: ch && gs ? getEffectiveMaxMp(ch, gs.equippedGear) : 0,
        regionId: ch?.currentRegion ?? '',
        floor: ch?.currentFloor ?? null,
        online: m.online && !!ch,
        joinedAt: m.joinedAt,
      });
    }
    members.sort((a, b) => a.joinedAt - b.joinedAt);
    return { id: party.id, leaderId: party.leaderId, dropMode: party.dropMode, members };
  }

  private teammatesView(session: PlayerSession): TeammateView[] {
    const instance = session.instance;
    if (!instance || !instance.key.startsWith('party:')) return [];
    const out: TeammateView[] = [];
    for (const m of presentMembers(instance)) {
      if (m === session) continue;
      const gs = m.game.getState();
      const ch = gs.character!;
      const mc = m.mapControl.getState();
      out.push({
        characterId: ch.id!,
        name: ch.name,
        className: ch.className,
        appearance: ch.appearance,
        position: mc.playerPosition,
        prevPosition: mc.prevPlayerPosition,
        hp: ch.hp,
        maxHp: getEffectiveMaxHp(ch, gs.equippedGear),
      });
    }
    return out;
  }

  private onMapView(session: PlayerSession, regionId: string, floor: number | null): OnMapPlayerView[] {
    const out: OnMapPlayerView[] = [];
    for (const s of this.sessions) {
      if (s === session) continue;
      const ch = s.game.getState().character;
      if (!ch?.id || ch.currentRegion !== regionId || (ch.currentFloor ?? null) !== (floor ?? null)) continue;
      // 隊籍只對「邀請過而被擋下」的對象揭露，且對方離隊後就不再標記
      const known = this.knownInParty.get(session)?.has(ch.id) ?? false;
      out.push({
        characterId: ch.id, name: ch.name, className: ch.className, level: ch.level,
        inParty: known && !!this.parties.partyOf(ch.id),
      });
    }
    out.sort((a, b) => a.characterId - b.characterId);
    return out;
  }
}
