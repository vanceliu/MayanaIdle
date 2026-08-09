// === 資料版本 ===
// 提高此值 = 淘汰所有低於此版本的角色：開機時由 `systems/dataVersionPurge.ts`
// 清除該角色與其全部附屬資料（裝備、背包、個人倉庫、localStorage 設定），
// 帳號下所有角色都被淘汰時連共用倉庫一併清除。
// 同時也是角色匯入檔的最低門檻（見 `systems/characterTransfer.ts`）。
//
// v3：角色名稱改為全球唯一（§ 19.4）。舊角色的名稱可能不符新規則或已被他人註冊，
//     會永久卡在「無法上榜」，趁玩家數尚少一次重來。
export const CURRENT_DATA_VERSION = 5;

// === 全域倍率 ===
export const GOLD_RATE_MULTIPLIER = 1.0;
export const DROP_RATE_MULTIPLIER = 1.0;
