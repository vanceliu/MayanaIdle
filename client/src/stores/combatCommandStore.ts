import { create } from 'zustand';

/**
 * 手動介入指令佇列（`03-combat.md` § 3.6）。
 *
 * 戰鬥狀態（`PlayerCombatContext`）由 PixiGame 的 ticker 以 ref 持有，React 層寫不到；
 * 反過來 `monsterHudStore` 是 ticker → React 的**唯讀快照**。
 * 這裡是缺的那一半：React → ticker 的指令通道，每 tick 消費一次。
 *
 * 兩個方向不可合併進同一個 store —— 快照每 tick 覆寫，指令放進去會被自己的快照沖掉。
 */
export interface CombatCommandState {
  /** 玩家點選的目標怪物 id，等下一個 tick 寫進 FSM */
  pendingTargetId: string | null;
  /**
   * 玩家從快捷格指定、要在下一個攻擊 tick 施放的**攻擊技能** id。
   *
   * buff／治癒技能不走這裡：它們不佔攻擊 tick，由 `gameStore.castSelfSkill()`
   * 立即施放（§ 3.6.2）。攻擊 tick 只在有目標且進入射程時才觸發，
   * 把補血排進去等於「地圖上沒怪就補不了血」。
   */
  pendingSkillId: string | null;

  requestTarget: (monsterId: string) => void;
  requestSkill: (skillId: string) => void;
  /** ticker 專用：取出並清空目標指令 */
  consumeTarget: () => string | null;
  /** ticker 專用：取出並清空技能指令 */
  consumeSkill: () => string | null;
  clear: () => void;
}

export const useCombatCommandStore = create<CombatCommandState>((set, get) => ({
  pendingTargetId: null,
  pendingSkillId: null,

  requestTarget: monsterId => set({ pendingTargetId: monsterId }),

  // 重複按只保留最後一次（§ 3.6.2）：連點三個技能不會排成三次出手
  requestSkill: skillId => set({ pendingSkillId: skillId }),

  consumeTarget: () => {
    const id = get().pendingTargetId;
    if (id != null) set({ pendingTargetId: null });
    return id;
  },

  consumeSkill: () => {
    const id = get().pendingSkillId;
    if (id != null) set({ pendingSkillId: null });
    return id;
  },

  clear: () => {
    const state = get();
    if (state.pendingTargetId === null && state.pendingSkillId === null) return;
    set({ pendingTargetId: null, pendingSkillId: null });
  },
}));
