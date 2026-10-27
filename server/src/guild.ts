/**
 * 公會（`docs/design/11-guild.md`）。隊籍與名稱在記憶體建索引；邀請只存記憶體（`18-data-schema.md` § 18.12）。
 * 改變隊籍的操作依序執行（`exclusive`），寫入 `GuildStorage` 成功後才改記憶體。
 */
import { randomBytes } from 'node:crypto';
import type { ClassName } from '../../client/src/models/character';
import {
  GUILD_CREATE_MIN_LEVEL, GUILD_NAME_ERROR_MESSAGES, guildCapacity, guildNameKey, validateGuildName,
} from '../../client/src/models/guild';
import type { GuildMemberView, GuildView, GuildWarehouseView } from '../../client/src/stores/guildStore';
import type { EquipmentInstance } from '../../client/src/models/equipment';
import { makeBagItem, type BagItem } from '../../client/src/models/bagItem';
import { GUILD_WAREHOUSE_CAPACITY } from '../../client/src/models/guild';
import type { GuildStorage, GuildWarehouseWrite, MemberSnapshot } from './db/guildStorage';
import { INVITE_TTL_MS } from './party';
import { log } from './log';

export interface GuildIdentity {
  characterId: number;
  name: string;
  className: ClassName;
  level: number;
}

export interface GuildMember extends GuildIdentity {
  joinedAt: number;
}

export interface Guild {
  id: number;
  name: string;
  nameKey: string;
  leaderId: number;
  /** 盟主魅力（含裝備）的最後已知值；盟主離線時上限照這個算 */
  leaderCha: number;
  createdAt: number;
  members: Map<number, GuildMember>;
  warehouse: GuildWarehouse;
}

/** 公會倉庫（§ 11.8） */
export interface GuildWarehouse {
  equipment: Map<number, EquipmentInstance>;
  /** itemId → 數量 */
  items: Map<number, number>;
  gold: number;
}

function emptyWarehouse(): GuildWarehouse {
  return { equipment: new Map(), items: new Map(), gold: 0 };
}

export interface GuildInvite {
  id: string;
  guildId: number;
  fromCharacterId: number;
  toCharacterId: number;
  expiresAt: number;
}

export class GuildError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function newId(): string {
  return randomBytes(6).toString('hex');
}

export class GuildManager {
  readonly guilds = new Map<number, Guild>();
  private readonly byCharacter = new Map<number, number>();
  private readonly byNameKey = new Map<string, number>();
  readonly invites = new Map<string, GuildInvite>();

  private readonly storage: GuildStorage;
  private lock: Promise<void> = Promise.resolve();

  constructor(storage: GuildStorage) {
    this.storage = storage;
    const { guilds, members, warehouses } = storage.loadAll();
    for (const g of guilds) {
      const stored = warehouses.get(g.id);
      this.guilds.set(g.id, {
        id: g.id, name: g.name, nameKey: g.nameKey, leaderId: g.leaderCharacterId,
        leaderCha: g.leaderCha, createdAt: g.createdAt, members: new Map(),
        warehouse: stored
          ? { equipment: new Map(stored.equipment.map(e => [e.id!, e])), items: new Map(stored.items), gold: stored.gold }
          : emptyWarehouse(),
      });
      this.byNameKey.set(g.nameKey, g.id);
    }
    for (const m of members) {
      const guild = this.guilds.get(m.guildId);
      if (!guild) continue;
      guild.members.set(m.characterId, {
        characterId: m.characterId, name: m.name, className: m.className, level: m.level, joinedAt: m.joinedAt,
      });
      this.byCharacter.set(m.characterId, guild.id);
    }
  }

  guildOf(characterId: number): Guild | null {
    const id = this.byCharacter.get(characterId);
    return id ? this.guilds.get(id) ?? null : null;
  }

  capacity(guild: Guild): number {
    return guildCapacity(guild.leaderCha);
  }

  /** § 11.3、§ 11.4 */
  create(leader: GuildIdentity, leaderCha: number, rawName: unknown, now: number): Promise<Guild> {
    return this.exclusive(() => this.createNow(leader, leaderCha, rawName, now));
  }

  private async createNow(leader: GuildIdentity, leaderCha: number, rawName: unknown, now: number): Promise<Guild> {
    if (this.guildOf(leader.characterId)) throw new GuildError('in_guild', '你已有公會');
    if (leader.level < GUILD_CREATE_MIN_LEVEL) throw new GuildError('level', `需要等級 ${GUILD_CREATE_MIN_LEVEL} 才能建立公會`);
    const name = typeof rawName === 'string' ? rawName.trim().normalize('NFC') : '';
    const nameError = validateGuildName(name);
    if (nameError) throw new GuildError('bad_name', GUILD_NAME_ERROR_MESSAGES[nameError]);
    const nameKey = guildNameKey(name);
    if (this.byNameKey.has(nameKey)) throw new GuildError('name_taken', `公會名稱「${name}」已經有人用了`);

    let id: number;
    try {
      id = await this.storage.createGuild(
        { name, nameKey, leaderCharacterId: leader.characterId, leaderCha, createdAt: now },
        { ...leader, joinedAt: now },
      );
    } catch {
      throw new GuildError('name_taken', `公會名稱「${name}」已經有人用了`);
    }
    const guild: Guild = { id, name, nameKey, leaderId: leader.characterId, leaderCha, createdAt: now, members: new Map(), warehouse: emptyWarehouse() };
    guild.members.set(leader.characterId, { ...leader, joinedAt: now });
    this.guilds.set(id, guild);
    this.byNameKey.set(nameKey, id);
    this.byCharacter.set(leader.characterId, id);
    return guild;
  }

  /** 只有盟主（§ 11.6）。回傳解散前的公會，呼叫端據此通知全體成員 */
  disband(leaderId: number): Promise<Guild> {
    return this.exclusive(async () => {
      const guild = this.requireLeader(leaderId);
      await this.removeGuild(guild);
      return guild;
    });
  }

  /** 只有盟主邀請；對象無公會；人數以盟主當下魅力計（§ 11.5、§ 11.6） */
  invite(leaderId: number, leaderCha: number, to: GuildIdentity, now: number): GuildInvite {
    const guild = this.requireLeader(leaderId);
    if (to.characterId === leaderId) throw new GuildError('self', '不能邀請自己');
    if (this.guildOf(to.characterId)) throw new GuildError('target_in_guild', `${to.name} 已有公會`);
    this.noteLeaderCha(guild, leaderCha);
    if (guild.members.size >= this.capacity(guild)) throw new GuildError('guild_full', '公會人數已達上限');
    this.pruneInvites(now);
    for (const inv of this.invites.values()) {
      if (inv.guildId === guild.id && inv.toCharacterId === to.characterId) return inv;
    }
    const invite: GuildInvite = {
      id: newId(), guildId: guild.id, fromCharacterId: leaderId, toCharacterId: to.characterId, expiresAt: now + INVITE_TTL_MS,
    };
    this.invites.set(invite.id, invite);
    return invite;
  }

  invitesFor(characterId: number, now: number): GuildInvite[] {
    this.pruneInvites(now);
    return [...this.invites.values()].filter(i => i.toCharacterId === characterId);
  }

  pruneInvites(now: number): void {
    for (const [id, inv] of this.invites) if (inv.expiresAt <= now) this.invites.delete(id);
  }

  /** 接受當下再檢查一次：自己仍無公會、公會仍在、人數未滿（§ 11.5） */
  accept(inviteId: string, acceptor: GuildIdentity, now: number): Promise<Guild> {
    return this.exclusive(() => this.acceptNow(inviteId, acceptor, now));
  }

  private async acceptNow(inviteId: string, acceptor: GuildIdentity, now: number): Promise<Guild> {
    const invite = this.invites.get(inviteId);
    this.invites.delete(inviteId);
    if (!invite || invite.toCharacterId !== acceptor.characterId || invite.expiresAt <= now) {
      throw new GuildError('invite_gone', '邀請已失效');
    }
    if (this.guildOf(acceptor.characterId)) throw new GuildError('in_guild', '你已有公會');
    const guild = this.guilds.get(invite.guildId);
    if (!guild) throw new GuildError('invite_gone', '公會已解散');
    if (guild.members.size >= this.capacity(guild)) throw new GuildError('guild_full', '公會人數已達上限');
    const member: GuildMember = { ...acceptor, joinedAt: now };
    await this.storage.addMember({ ...member, guildId: guild.id });
    guild.members.set(acceptor.characterId, member);
    this.byCharacter.set(acceptor.characterId, guild.id);
    return guild;
  }

  decline(inviteId: string, characterId: number): GuildInvite | undefined {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toCharacterId !== characterId) return undefined;
    this.invites.delete(inviteId);
    return invite;
  }

  /** 盟主不可退出，只能解散（§ 11.6） */
  leave(characterId: number): Promise<Guild> {
    return this.exclusive(async () => {
      const guild = this.guildOf(characterId);
      if (!guild) throw new GuildError('no_guild', '你沒有公會');
      if (guild.leaderId === characterId) throw new GuildError('leader_leave', '盟主不能退出，只能解散公會');
      await this.removeMember(guild, characterId);
      return guild;
    });
  }

  kick(leaderId: number, targetId: number): Promise<Guild> {
    return this.exclusive(async () => {
      const guild = this.requireLeader(leaderId);
      if (targetId === leaderId) throw new GuildError('self', '不能踢除自己');
      if (!guild.members.has(targetId)) throw new GuildError('not_member', '對方不在公會中');
      await this.removeMember(guild, targetId);
      return guild;
    });
  }

  /** 刪除角色（§ 11.6）：成員移出；盟主則公會解散 */
  removeCharacter(characterId: number): Promise<{ disbanded: Guild | null; left: Guild | null }> {
    return this.exclusive(async () => {
      const guild = this.guildOf(characterId);
      for (const [id, inv] of this.invites) if (inv.toCharacterId === characterId) this.invites.delete(id);
      if (!guild) return { disbanded: null, left: null };
      if (guild.leaderId === characterId) {
        await this.removeGuild(guild);
        return { disbanded: guild, left: null };
      }
      await this.removeMember(guild, characterId);
      return { disbanded: null, left: guild };
    });
  }

  /** 盟主在線時同步最後已知魅力，只在數值變動時寫入 */
  noteLeaderCha(guild: Guild, cha: number): void {
    if (guild.leaderCha === cha) return;
    guild.leaderCha = cha;
    this.persistCache(this.storage.setLeaderCha(guild.id, cha));
  }

  /** 進出世界時更新離線名單顯示的名稱／職業／等級 */
  refreshMember(characterId: number, snapshot: MemberSnapshot): void {
    const guild = this.guildOf(characterId);
    const member = guild?.members.get(characterId);
    if (!member) return;
    if (member.name === snapshot.name && member.className === snapshot.className && member.level === snapshot.level) return;
    Object.assign(member, snapshot);
    this.persistCache(this.storage.updateMember(characterId, snapshot));
  }

  /** § 11.7：盟主第一列，其餘在線優先、再依加入時間 */
  view(guild: Guild, live: (characterId: number) => { online: boolean; level?: number }): GuildView {
    const members: GuildMemberView[] = [...guild.members.values()].map(m => {
      const state = live(m.characterId);
      return {
        characterId: m.characterId, name: m.name, className: m.className,
        level: state.level ?? m.level, online: state.online, joinedAt: m.joinedAt,
      };
    });
    members.sort((a, b) => {
      if (a.characterId === guild.leaderId) return -1;
      if (b.characterId === guild.leaderId) return 1;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.joinedAt - b.joinedAt;
    });
    return { id: guild.id, name: guild.name, leaderId: guild.leaderId, capacity: this.capacity(guild), members };
  }

  /** 已用格數：一件裝備 1 格、同種道具合計 1 格、金幣不佔格（§ 11.8） */
  warehouseUsed(guild: Guild): number {
    return guild.warehouse.equipment.size + guild.warehouse.items.size;
  }

  warehouseView(guild: Guild): GuildWarehouseView {
    const { equipment, items, gold } = guild.warehouse;
    return {
      equipment: [...equipment.values()].sort((a, b) => a.id! - b.id!),
      items: [...items].map(([itemId, amount]) => makeBagItem(itemId, amount)).filter((b): b is BagItem => b !== null),
      gold,
      used: this.warehouseUsed(guild),
      capacity: GUILD_WAREHOUSE_CAPACITY,
    };
  }

  /**
   * 倉庫存取：與其他改變公會的操作排成一列（兩人同時取同一件只有一人拿到）。
   * `plan` 在排到時才讀當下狀態並回傳要落地的內容；寫入成功才改記憶體，再呼叫 `apply`。
   */
  async withWarehouse<T>(
    characterId: number,
    plan: (guild: Guild) => { write: GuildWarehouseWrite; result: T; apply?: () => void },
  ): Promise<T> {
    return this.exclusive(async () => {
      const guild = this.guildOf(characterId);
      if (!guild) throw new GuildError('no_guild', '你沒有公會');
      const { write, result, apply } = plan(guild);
      await this.storage.writeWarehouse(guild.id, write);
      const w = guild.warehouse;
      for (const item of write.equipment) {
        if (item.storageType === 'guild') w.equipment.set(item.id!, item);
        else w.equipment.delete(item.id!);
      }
      for (const line of write.items) {
        if (line.amount > 0) w.items.set(line.itemId, line.amount);
        else w.items.delete(line.itemId);
      }
      w.gold = write.gold;
      apply?.();
      return result;
    });
  }

  private requireLeader(leaderId: number): Guild {
    const guild = this.guildOf(leaderId);
    if (!guild) throw new GuildError('no_guild', '你沒有公會');
    if (guild.leaderId !== leaderId) throw new GuildError('not_leader', '只有盟主可以這麼做');
    return guild;
  }

  /** 改變隊籍的操作排成一列：檢查與寫入之間不讓別的操作插進來（例如兩人同時搶最後一個名額） */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lock.then(fn, fn);
    this.lock = next.then(() => {}, () => {});
    return next;
  }

  /** 最後已知魅力與名單快照只是顯示用的快取：記憶體先改，寫入失敗只記 log */
  private persistCache(write: Promise<void>): void {
    write.catch(e => log.error('guild cache write failed', e));
  }

  private async removeMember(guild: Guild, characterId: number): Promise<void> {
    await this.storage.removeMember(characterId);
    guild.members.delete(characterId);
    this.byCharacter.delete(characterId);
  }

  private async removeGuild(guild: Guild): Promise<void> {
    await this.storage.deleteGuild(guild.id);
    for (const id of guild.members.keys()) this.byCharacter.delete(id);
    this.guilds.delete(guild.id);
    this.byNameKey.delete(guild.nameKey);
    for (const [id, inv] of this.invites) if (inv.guildId === guild.id) this.invites.delete(id);
  }
}
