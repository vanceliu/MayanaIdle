import { db } from '../db/database';
import { generateCharacterUuid } from '../models/characterIdentity';

/**
 * 角色的排行榜寫入密鑰（`37-statistics.md` § 37.4.3）。
 *
 * 伺服端採 TOFU：首次上傳統計時把 `sha256(authToken)` 存下來，之後不符即 403。
 * 因此**同一個 uuid 必須永遠配同一把密鑰** —— 密鑰是跟著角色走的身分，不是每台裝置各自產生的東西。
 *
 * 這個函式是補發密鑰的唯一入口。任何「可能讓角色跨裝置存在」的路徑
 * （目前是匯出，以及上傳前的檢查）都必須先呼叫它，否則會出現：
 *
 *   舊角色從未上傳 → 匯出檔沒有密鑰 → 新裝置還原後自己產一把不同的
 *   → 兩台各自綁定，先上傳的那台贏，另一台永遠 403
 */
export async function ensureCharacterAuthToken(characterId: number): Promise<string | null> {
  const char = await db.characters.get(characterId);
  if (!char) return null;
  if (char.authToken) return char.authToken;

  const authToken = generateCharacterUuid();
  await db.characters.update(characterId, { authToken });
  return authToken;
}
