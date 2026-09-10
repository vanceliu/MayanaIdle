/**
 * 組隊（`97-selfhosted-server.md` § 97.7.3）。純記憶體，server 重啟即消失（`18-data-schema.md` § 18.12）。
 * 只管隊籍與隊長權限；實例切換由 `instances.ts` 依隊籍鍵值處理。
 */
import { randomBytes } from 'node:crypto';
import type { ClassName } from '../../client/src/models/character';
import type { PartyDropMode } from '../../client/src/systems/mapInstance';
import { PARTY_MAX_MEMBERS } from '../../client/src/stores/partyStore';

export interface PartyMember {
  characterId: number;
  name: string;
  className: ClassName;
  joinedAt: number;
  online: boolean;
}

export interface Party {
  id: string;
  leaderId: number;
  dropMode: PartyDropMode;
  members: Map<number, PartyMember>;
  createdAt: number;
}

export interface PartyInvite {
  id: string;
  /** 邀請者當時的隊伍；null ＝ 邀請者尚未成隊，接受時建隊 */
  partyId: string | null;
  fromCharacterId: number;
  fromName: string;
  toCharacterId: number;
  expiresAt: number;
}

export const INVITE_TTL_MS = 60_000;

export class PartyError extends Error {
  readonly code: string;
  /** `target_in_party` 專用：被擋下的對象，供 § 97.7.1 的名單揭露隊籍 */
  readonly targetCharacterId?: number;
  constructor(code: string, message: string, targetCharacterId?: number) {
    super(message);
    this.code = code;
    this.targetCharacterId = targetCharacterId;
  }
}

export interface MemberIdentity {
  characterId: number;
  name: string;
  className: ClassName;
}

function newId(): string {
  return randomBytes(6).toString('hex');
}

export class PartyManager {
  readonly parties = new Map<string, Party>();
  private readonly byCharacter = new Map<number, string>();
  readonly invites = new Map<string, PartyInvite>();

  partyOf(characterId: number): Party | null {
    const id = this.byCharacter.get(characterId);
    return id ? this.parties.get(id) ?? null : null;
  }

  /** 邀請入口的規則：對方未在任何隊伍、隊伍未滿、不可邀自己 */
  invite(from: MemberIdentity, to: MemberIdentity, now: number): PartyInvite {
    if (from.characterId === to.characterId) throw new PartyError('self', '不能邀請自己');
    if (this.partyOf(to.characterId)) throw new PartyError('target_in_party', `${to.name} 已在隊伍中`, to.characterId);
    const party = this.partyOf(from.characterId);
    if (party) {
      if (party.leaderId !== from.characterId) throw new PartyError('not_leader', '只有隊長可以邀請');
      if (party.members.size >= PARTY_MAX_MEMBERS) throw new PartyError('party_full', '隊伍已滿');
    }
    this.pruneInvites(now);
    for (const inv of this.invites.values()) {
      if (inv.fromCharacterId === from.characterId && inv.toCharacterId === to.characterId) return inv;
    }
    const invite: PartyInvite = {
      id: newId(),
      partyId: party?.id ?? null,
      fromCharacterId: from.characterId,
      fromName: from.name,
      toCharacterId: to.characterId,
      expiresAt: now + INVITE_TTL_MS,
    };
    this.invites.set(invite.id, invite);
    return invite;
  }

  invitesFor(characterId: number, now: number): PartyInvite[] {
    this.pruneInvites(now);
    return [...this.invites.values()].filter(i => i.toCharacterId === characterId);
  }

  pruneInvites(now: number): void {
    for (const [id, inv] of this.invites) if (inv.expiresAt <= now) this.invites.delete(id);
  }

  /** 對方確認後成隊；建隊者為隊長 */
  accept(inviteId: string, acceptor: MemberIdentity, inviter: (characterId: number) => MemberIdentity | null, now: number): Party {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.toCharacterId !== acceptor.characterId || invite.expiresAt <= now) {
      this.invites.delete(inviteId);
      throw new PartyError('invite_gone', '邀請已失效');
    }
    this.invites.delete(inviteId);
    if (this.partyOf(acceptor.characterId)) throw new PartyError('in_party', '你已在隊伍中');

    let party = invite.partyId ? this.parties.get(invite.partyId) ?? null : null;
    if (!party) {
      // 邀請者已離隊或尚未成隊：邀請者仍未在別的隊伍才能建隊
      const existing = this.partyOf(invite.fromCharacterId);
      if (existing) {
        if (existing.leaderId !== invite.fromCharacterId) throw new PartyError('invite_gone', '邀請已失效');
        party = existing;
      } else {
        const from = inviter(invite.fromCharacterId);
        if (!from) throw new PartyError('invite_gone', '邀請者已離線');
        party = { id: newId(), leaderId: from.characterId, dropMode: 'participants', members: new Map(), createdAt: now };
        party.members.set(from.characterId, { ...from, joinedAt: now, online: true });
        this.parties.set(party.id, party);
        this.byCharacter.set(from.characterId, party.id);
      }
    }
    if (party.members.size >= PARTY_MAX_MEMBERS) throw new PartyError('party_full', '隊伍已滿');
    party.members.set(acceptor.characterId, { ...acceptor, joinedAt: now, online: true });
    this.byCharacter.set(acceptor.characterId, party.id);
    return party;
  }

  decline(inviteId: string, characterId: number): void {
    const invite = this.invites.get(inviteId);
    if (invite && invite.toCharacterId === characterId) this.invites.delete(inviteId);
  }

  /** 主動離隊：隊長離隊交給在線成員中入隊最早者；只剩 1 人自動解散 */
  leave(characterId: number): Party | null {
    const party = this.partyOf(characterId);
    if (!party) return null;
    this.removeMember(party, characterId);
    return party;
  }

  kick(leaderId: number, targetId: number): Party {
    const party = this.requireLeader(leaderId);
    if (targetId === leaderId) throw new PartyError('self', '不能踢除自己');
    if (!party.members.has(targetId)) throw new PartyError('not_member', '對方不在隊伍中');
    this.removeMember(party, targetId);
    return party;
  }

  transferLeader(leaderId: number, targetId: number): Party {
    const party = this.requireLeader(leaderId);
    const target = party.members.get(targetId);
    if (!target) throw new PartyError('not_member', '對方不在隊伍中');
    if (!target.online) throw new PartyError('target_offline', '對方離線中');
    party.leaderId = targetId;
    return party;
  }

  setDropMode(leaderId: number, mode: PartyDropMode): Party {
    const party = this.requireLeader(leaderId);
    if (mode !== 'all' && mode !== 'participants') throw new PartyError('bad_mode', '未知的掉落模式');
    party.dropMode = mode;
    return party;
  }

  /** 斷線只標記離線、隊籍保留；回線自動回到隊伍 */
  setOnline(characterId: number, online: boolean, identity?: MemberIdentity): void {
    const party = this.partyOf(characterId);
    if (!party) return;
    const member = party.members.get(characterId)!;
    member.online = online;
    if (identity) {
      member.name = identity.name;
      member.className = identity.className;
    }
  }

  private requireLeader(leaderId: number): Party {
    const party = this.partyOf(leaderId);
    if (!party) throw new PartyError('no_party', '你不在隊伍中');
    if (party.leaderId !== leaderId) throw new PartyError('not_leader', '只有隊長可以這麼做');
    if (!party.members.get(leaderId)?.online) throw new PartyError('leader_offline', '隊長離線中');
    return party;
  }

  private removeMember(party: Party, characterId: number): void {
    party.members.delete(characterId);
    this.byCharacter.delete(characterId);
    if (party.members.size <= 1) {
      for (const id of party.members.keys()) this.byCharacter.delete(id);
      party.members.clear();
      this.parties.delete(party.id);
      return;
    }
    if (party.leaderId === characterId) {
      const ordered = [...party.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      party.leaderId = (ordered.find(m => m.online) ?? ordered[0]).characterId;
    }
  }
}
