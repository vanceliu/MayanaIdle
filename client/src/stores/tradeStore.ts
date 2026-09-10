/**
 * 玩家交易（`97-selfhosted-server.md` § 97.7 表「交易：本服玩家之間，即時寫 SQLite」）。
 * 判定全在 server；本機 action 是 RPC 代理（`net/mirror.ts`），單機形態沒有交易。
 */
import { create } from 'zustand';
import type { EquipmentInstance } from '../models/equipment';
import { defaultSession, type Session } from './session';

export interface TradeOfferView {
  id: string;
  fromCharacterId: number;
  fromName: string;
  expiresAt: number;
}

export interface TradeLine {
  itemId: number;
  amount: number;
}

export interface TradeSideView {
  characterId: number;
  name: string;
  equipment: EquipmentInstance[];
  items: TradeLine[];
  gold: number;
  locked: boolean;
  confirmed: boolean;
}

export type TradeStage = 'editing' | 'locked' | 'done';

export interface TradeView {
  id: string;
  me: TradeSideView;
  other: TradeSideView;
  stage: TradeStage;
}

export interface TradeOfferInput {
  equipmentIds: number[];
  items: TradeLine[];
  gold: number;
}

export interface TradeState {
  trade: TradeView | null;
  offers: TradeOfferView[];
  message: string | null;

  offer: (characterId: number) => Promise<boolean>;
  accept: (offerId: string) => Promise<boolean>;
  decline: (offerId: string) => Promise<boolean>;
  setOffer: (input: TradeOfferInput) => Promise<boolean>;
  lock: () => Promise<boolean>;
  confirm: () => Promise<boolean>;
  cancel: () => Promise<boolean>;
  setMessage: (message: string | null) => void;
  reset: () => void;
}

export function createTradeStore(_session?: Session) {
  return create<TradeState>(set => ({
    trade: null,
    offers: [],
    message: null,

    offer: async () => false,
    accept: async () => false,
    decline: async () => false,
    setOffer: async () => false,
    lock: async () => false,
    confirm: async () => false,
    cancel: async () => false,
    setMessage: message => set({ message }),
    reset: () => set({ trade: null, offers: [], message: null }),
  }));
}

export const useTradeStore = createTradeStore(defaultSession);
defaultSession.trade = useTradeStore;
