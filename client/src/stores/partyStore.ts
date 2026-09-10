/**
 * 隊伍狀態（`97-selfhosted-server.md` § 97.7.3）。
 *
 * 判定全部在 server：本機的 action 是 RPC 代理（`net/mirror.ts`），單機形態沒有隊伍。
 * 狀態由 server 每 tick 以 patch 鏡像；`teammates` 是同實例在場隊友的位置，供渲染插值。
 */
import { create } from 'zustand';
import type { Position } from '../models/mapControl';
import type { Appearance } from '../models/appearance';
import type { ClassName } from '../models/character';
import type { PartyDropMode } from '../systems/mapInstance';
import { defaultSession, type Session } from './session';

export const PARTY_MAX_MEMBERS = 5;

export interface PartyMemberView {
  characterId: number;
  name: string;
  className: ClassName;
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  regionId: string;
  floor: number | null;
  online: boolean;
  joinedAt: number;
}

export interface PartyView {
  id: string;
  leaderId: number;
  dropMode: PartyDropMode;
  members: PartyMemberView[];
}

export interface PartyInviteView {
  id: string;
  partyId: string;
  fromCharacterId: number;
  fromName: string;
  expiresAt: number;
}

/** 同一個實例、在場的隊友 */
export interface TeammateView {
  characterId: number;
  name: string;
  className: ClassName;
  appearance?: Appearance;
  position: Position;
  prevPosition: Position;
  hp: number;
  maxHp: number;
}

/** 同一張地圖的非隊友：只有名單，無座標（§ 97.7.1） */
export interface OnMapPlayerView {
  characterId: number;
  name: string;
  className: ClassName;
  level: number;
  /** 只有自己邀請被回絕過的對象才為 true；名單本身不透露隊籍 */
  inParty: boolean;
}

export interface PartyState {
  party: PartyView | null;
  invites: PartyInviteView[];
  teammates: TeammateView[];
  onMap: OnMapPlayerView[];
  /** 上一次操作的結果訊息（拒絕原因等） */
  message: string | null;

  /** 邀請對象：名單上點選傳角色 id，手動輸入傳角色名稱（§ 97.7.3） */
  invite: (target: number | string) => Promise<boolean>;
  accept: (inviteId: string) => Promise<boolean>;
  decline: (inviteId: string) => Promise<boolean>;
  leave: () => Promise<boolean>;
  kick: (characterId: number) => Promise<boolean>;
  transferLeader: (characterId: number) => Promise<boolean>;
  setDropMode: (mode: PartyDropMode) => Promise<boolean>;
  setMessage: (message: string | null) => void;
  reset: () => void;
}

export function createPartyStore(_session?: Session) {
  return create<PartyState>(set => ({
    party: null,
    invites: [],
    teammates: [],
    onMap: [],
    message: null,

    invite: async () => false,
    accept: async () => false,
    decline: async () => false,
    leave: async () => false,
    kick: async () => false,
    transferLeader: async () => false,
    setDropMode: async () => false,
    setMessage: message => set({ message }),
    reset: () => set({ party: null, invites: [], teammates: [], onMap: [], message: null }),
  }));
}

export const usePartyStore = createPartyStore(defaultSession);
defaultSession.party = usePartyStore;

export function isPartyLeader(party: PartyView | null, characterId: number | undefined): boolean {
  return !!party && characterId !== undefined && party.leaderId === characterId;
}
