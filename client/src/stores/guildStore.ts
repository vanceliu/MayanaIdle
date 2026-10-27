/**
 * 公會狀態（`docs/design/11-guild.md`）。
 *
 * 判定全部在 server：本機的 action 是 RPC 代理（`net/mirror.ts`），單機形態沒有公會。
 * 狀態由 server 以 patch 鏡像。
 */
import { create } from 'zustand';
import type { ClassName } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import type { BagItem } from '../models/bagItem';
import { defaultSession, type Session } from './session';

export interface GuildMemberView {
  characterId: number;
  name: string;
  className: ClassName;
  level: number;
  online: boolean;
  joinedAt: number;
}

export interface GuildView {
  id: number;
  name: string;
  leaderId: number;
  /** 盟主魅力（含裝備）× 2（§ 11.5） */
  capacity: number;
  /** 盟主第一列，其餘在線優先、再依加入時間（§ 11.7） */
  members: GuildMemberView[];
}

export interface GuildInviteView {
  id: string;
  guildId: number;
  guildName: string;
  fromName: string;
  expiresAt: number;
}

/** 公會倉庫快照（§ 11.8）：只在打開分頁與自己存取後送出，不隨他人變動推送 */
export interface GuildWarehouseView {
  equipment: EquipmentInstance[];
  items: BagItem[];
  gold: number;
  used: number;
  capacity: number;
}

export interface GuildWarehouseMove {
  equipmentIds?: number[];
  materials?: { itemId: number; amount: number }[];
}

export interface GuildState {
  guild: GuildView | null;
  invites: GuildInviteView[];
  /** 公會倉庫分頁開著時才有值 */
  warehouse: GuildWarehouseView | null;
  /** 上一次操作的結果訊息 */
  message: string | null;

  create: (name: string) => Promise<boolean>;
  disband: () => Promise<boolean>;
  /** 名單上點選傳角色 id，手動輸入傳角色名稱 */
  invite: (target: number | string) => Promise<boolean>;
  accept: (inviteId: string) => Promise<boolean>;
  decline: (inviteId: string) => Promise<boolean>;
  leave: () => Promise<boolean>;
  kick: (characterId: number) => Promise<boolean>;
  openWarehouse: () => Promise<boolean>;
  closeWarehouse: () => Promise<boolean>;
  depositWarehouse: (move: GuildWarehouseMove) => Promise<boolean>;
  withdrawWarehouse: (move: GuildWarehouseMove) => Promise<boolean>;
  depositWarehouseGold: (amount: number) => Promise<boolean>;
  withdrawWarehouseGold: (amount: number) => Promise<boolean>;
  setMessage: (message: string | null) => void;
  /** 清除上一次操作的訊息；線上模式由 server 清除 */
  clearMessage: () => void;
  reset: () => void;
}

export function createGuildStore(_session?: Session) {
  return create<GuildState>(set => ({
    guild: null,
    invites: [],
    warehouse: null,
    message: null,

    create: async () => false,
    disband: async () => false,
    invite: async () => false,
    accept: async () => false,
    decline: async () => false,
    leave: async () => false,
    kick: async () => false,
    openWarehouse: async () => false,
    closeWarehouse: async () => false,
    depositWarehouse: async () => false,
    withdrawWarehouse: async () => false,
    depositWarehouseGold: async () => false,
    withdrawWarehouseGold: async () => false,
    setMessage: message => set({ message }),
    clearMessage: () => set({ message: null }),
    reset: () => set({ guild: null, invites: [], warehouse: null, message: null }),
  }));
}

export const useGuildStore = createGuildStore(defaultSession);
defaultSession.guild = useGuildStore;

export function isGuildLeader(guild: GuildView | null, characterId: number | undefined): boolean {
  return !!guild && characterId !== undefined && guild.leaderId === characterId;
}
