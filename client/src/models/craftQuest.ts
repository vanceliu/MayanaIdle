/**
 * 製作任務（`36-quest-system.md` § 36.13）
 *
 * 把鐵匠鋪某個配方的需求釘成一張任務，讓玩家在外面掛機時
 * 也能在任務追蹤視窗看到「還差什麼」。不給獎勵、不給貢獻，
 * 也不佔冒險者工會的接取名額（§ 36.13.1）。
 */

/**
 * 任務只存配方的 `templateId`，裝備名稱／素材名稱一律由 id 反查 seed 顯示
 * （`99-ai-constraints.md` § 99.1 第 3、7 條）—— 存名稱會在配方改名後靜默失聯。
 */
export interface CraftQuest {
  id: string;
  templateId: number;
}

/** § 36.13.2：與冒險者工會的 3 個分開計算，互不佔用 */
export const MAX_ACTIVE_CRAFT_QUESTS = 3;
