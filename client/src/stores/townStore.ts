import { create } from 'zustand';
import type { TownFacility } from '../components/TownView';

interface TownState {
  /** 目前開啟的設施面板；'list' 代表沒開 */
  facility: TownFacility;
  openFacility: (facility: TownFacility) => void;
  closeFacility: () => void;
}

/**
 * 城鎮設施的開關狀態。
 *
 * 從 `TownView` 的區域 state 抽出來，是因為現在有兩個入口：
 * 設施 icon 快捷列（React）與地圖上的 NPC（Pixi），兩邊要開同一個面板。
 *
 * **沒有距離限制**：畫面上看得到的 NPC，點下去就開（§ 99.6）。
 * 因此不需要「先走過去、走到才開」那套待處理狀態 —— 點擊當下就決定結果，
 * 也就沒有「停下來卻沒走到要放棄」之類的邊界要處理。
 */
export const useTownStore = create<TownState>((set) => ({
  facility: 'list',
  openFacility: (facility) => set({ facility }),
  closeFacility: () => set({ facility: 'list' }),
}));
