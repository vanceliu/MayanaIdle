import { describe, it, expect, beforeEach } from 'vitest';
import { PartyManager, PartyError, INVITE_TTL_MS, type MemberIdentity } from '../party';

/** § 97.7.3 組隊規則 */
const A: MemberIdentity = { characterId: 1, name: 'A', className: 'knight' };
const B: MemberIdentity = { characterId: 2, name: 'B', className: 'elf' };
const C: MemberIdentity = { characterId: 3, name: 'C', className: 'priest' };
const D: MemberIdentity = { characterId: 4, name: 'D', className: 'thief' };
const E: MemberIdentity = { characterId: 5, name: 'E', className: 'elementalist' };
const F: MemberIdentity = { characterId: 6, name: 'F', className: 'knight' };
const ALL = [A, B, C, D, E, F];
const lookup = (id: number) => ALL.find(m => m.characterId === id) ?? null;

describe('PartyManager', () => {
  let pm: PartyManager;
  const now = 1_000_000;
  beforeEach(() => {
    pm = new PartyManager();
  });

  function form(...members: MemberIdentity[]) {
    const [leader, ...rest] = members;
    for (const m of rest) {
      const inv = pm.invite(leader, m, now);
      pm.accept(inv.id, m, lookup, now);
    }
    return pm.partyOf(leader.characterId)!;
  }

  it('邀請 → 接受成隊，建隊者為隊長，掉落模式預設僅參與者', () => {
    const inv = pm.invite(A, B, now);
    expect(inv.partyId).toBeNull();
    const party = pm.accept(inv.id, B, lookup, now);
    expect(party.leaderId).toBe(1);
    expect(party.dropMode).toBe('participants');
    expect([...party.members.keys()]).toEqual([1, 2]);
    expect(pm.partyOf(2)).toBe(party);
  });

  it('對方已在隊伍或隊伍滿 5 人不可邀請', () => {
    form(A, B);
    expect(() => pm.invite(C, B, now)).toThrow(PartyError);
    form(A, C, D, E);
    expect(pm.partyOf(1)!.members.size).toBe(5);
    expect(() => pm.invite(A, F, now)).toThrow(/已滿/);
  });

  it('只有隊長可以邀請', () => {
    form(A, B);
    expect(() => pm.invite(B, C, now)).toThrow(/隊長/);
  });

  it('邀請 60 秒後失效', () => {
    const inv = pm.invite(A, B, now);
    expect(() => pm.accept(inv.id, B, lookup, now + INVITE_TTL_MS)).toThrow(/失效/);
  });

  it('主動離隊立即生效；只剩 1 人自動解散', () => {
    form(A, B, C);
    pm.leave(2);
    expect(pm.partyOf(2)).toBeNull();
    expect(pm.partyOf(1)!.members.size).toBe(2);
    pm.leave(3);
    expect(pm.partyOf(1)).toBeNull();
    expect(pm.parties.size).toBe(0);
  });

  it('隊長離隊交給在線成員中入隊最早者', () => {
    const inv1 = pm.invite(A, B, now);
    pm.accept(inv1.id, B, lookup, now + 1);
    const inv2 = pm.invite(A, C, now);
    pm.accept(inv2.id, C, lookup, now + 2);
    pm.setOnline(2, false);
    pm.leave(1);
    expect(pm.partyOf(3)!.leaderId).toBe(3);
  });

  it('踢人與轉讓只有隊長能做；隊長離線時無人可操作', () => {
    form(A, B, C);
    expect(() => pm.kick(2, 3)).toThrow(/隊長/);
    pm.kick(1, 3);
    expect(pm.partyOf(3)).toBeNull();
    pm.transferLeader(1, 2);
    expect(pm.partyOf(1)!.leaderId).toBe(2);
    pm.setOnline(2, false);
    expect(() => pm.setDropMode(2, 'all')).toThrow(/離線/);
  });

  it('斷線只標記離線、隊籍保留', () => {
    form(A, B);
    pm.setOnline(2, false);
    expect(pm.partyOf(2)!.members.get(2)!.online).toBe(false);
    pm.setOnline(2, true);
    expect(pm.partyOf(2)!.members.get(2)!.online).toBe(true);
  });

  it('掉落模式改動即時生效', () => {
    form(A, B);
    pm.setDropMode(1, 'all');
    expect(pm.partyOf(2)!.dropMode).toBe('all');
  });
});
