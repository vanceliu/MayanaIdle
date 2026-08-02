import { create } from 'zustand';

/**
 * 地圖怪物 HUD 快照（§ 24.8.3 怪物列表）
 *
 * 怪物實體數值（MonsterInstance）由 PixiGame 的 ticker 以 ref 持有，React 層讀不到，
 * 因此每個 tick 由 ticker 節流發佈一份唯讀快照給 UI 訂閱。
 */
export interface MonsterHudEntry {
  id: string;
  name: string;
  currentHp: number;
  maxHp: number;
  isBoss: boolean;
}

export interface MonsterHudState {
  entries: MonsterHudEntry[];
  /** 玩家目前鎖定攻擊的怪物 id（PlayerCombatContext.targetMonsterId） */
  targetId: string | null;

  publish: (entries: MonsterHudEntry[], targetId: string | null) => void;
  clear: () => void;
}

function isSameEntry(a: MonsterHudEntry, b: MonsterHudEntry): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.currentHp === b.currentHp &&
    a.maxHp === b.maxHp &&
    a.isBoss === b.isBoss
  );
}

export function isSameSnapshot(
  prev: MonsterHudEntry[],
  next: MonsterHudEntry[],
): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((entry, i) => isSameEntry(entry, next[i]));
}

export const useMonsterHudStore = create<MonsterHudState>((set, get) => ({
  entries: [],
  targetId: null,

  publish: (entries, targetId) => {
    const state = get();
    // 快照每 tick 產生，數值未變時不寫入 store，避免無謂 re-render
    if (state.targetId === targetId && isSameSnapshot(state.entries, entries)) return;
    set({ entries, targetId });
  },

  clear: () => {
    const state = get();
    if (state.entries.length === 0 && state.targetId === null) return;
    set({ entries: [], targetId: null });
  },
}));
