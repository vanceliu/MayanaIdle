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
 * 兩個入口共用同一份：設施 icon 快捷列（React）與地圖上的 NPC（Pixi）。
 *
 * **沒有距離限制**：畫面上看得到的 NPC，點下去就開（§ 13.2.1）。
 * 不做「先走過去、走到才開」的待處理狀態。
 */
export const useTownStore = create<TownState>((set) => ({
  facility: 'list',
  openFacility: (facility) => set({ facility }),
  closeFacility: () => set({ facility: 'list' }),
}));
