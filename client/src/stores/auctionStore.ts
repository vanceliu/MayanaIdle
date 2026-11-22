/**
 * 拍賣場狀態（`docs/design/57-auction.md`）。
 *
 * 判定全部在 server：本機的 action 是 RPC 代理（`net/mirror.ts`），單機形態沒有拍賣場。
 * 狀態由 server 以 patch 鏡像；清單只在自己操作後刷新（§ 57.6）。
 */
import { create } from 'zustand';
import type { AuctionListInput, AuctionListing, AuctionQuery } from '../models/auction';
import { defaultSession, type Session } from './session';

export interface AuctionSearchView {
  query: AuctionQuery;
  listings: AuctionListing[];
  total: number;
}

export interface AuctionState {
  /** 搜尋分頁的目前結果；視窗關閉時為 null */
  results: AuctionSearchView | null;
  /** 本角色上架中的（§ 57.7） */
  mine: AuctionListing[];
  /** 上一次操作的結果訊息 */
  message: string | null;

  open: () => Promise<boolean>;
  close: () => Promise<boolean>;
  search: (query: AuctionQuery) => Promise<boolean>;
  list: (input: AuctionListInput) => Promise<boolean>;
  cancel: (listingId: number) => Promise<boolean>;
  buy: (listingId: number) => Promise<boolean>;
  clearMessage: () => void;
  reset: () => void;
}

export function createAuctionStore(_session?: Session) {
  return create<AuctionState>(set => ({
    results: null,
    mine: [],
    message: null,

    open: async () => false,
    close: async () => false,
    search: async () => false,
    list: async () => false,
    cancel: async () => false,
    buy: async () => false,
    clearMessage: () => set({ message: null }),
    reset: () => set({ results: null, mine: [], message: null }),
  }));
}

export const useAuctionStore = createAuctionStore(defaultSession);
defaultSession.auction = useAuctionStore;
