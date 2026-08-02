/**
 * 角色身分：全球唯一 ID 與名稱規則
 * 規格見 `docs/design/19-account-character.md` § 19.4
 *
 * 此處的規則必須與 `leaderboard-worker/src/index.js` 的 NAME_PATTERN / validateName 一致，
 * 客戶端驗證只是 UX，伺服端會再驗一次。
 */

/**
 * § 19.4：中英數 + 符號 `- _ ~ = .`，2~12 字。符號可放在任何位置（含開頭與結尾）。
 *
 * 只有兩條實質限制：
 * 1. 不可全部都是符號 —— 純符號名稱難以辨識與稱呼
 * 2. 不可有空白（含全形）—— 對齊與冒名的主要來源
 *
 * 刻意不開放的符號與理由：
 * - `< > & " '`：雖然 React 會轉義，但混進名稱只會製造閱讀與回報上的困擾
 * - `/ \ %`：容易與網址、路徑、百分比編碼混淆
 * - `| , ;`：常見的分隔符，混進資料時難以辨別邊界
 * - `+ * ?`：查詢字串與萬用字元語意
 * - emoji 與控制字元：跨平台顯示不一致
 */
export const CHARACTER_NAME_PATTERN = /^(?=.*[A-Za-z0-9一-龥])[A-Za-z0-9一-龥\-_~=.]{2,12}$/;

/** 名稱中允許使用的符號，供錯誤訊息與文件引用 */
export const CHARACTER_NAME_ALLOWED_SYMBOLS = '-_~=.';
export const CHARACTER_NAME_MIN_LENGTH = 2;
export const CHARACTER_NAME_MAX_LENGTH = 12;

export type CharacterNameError = 'empty' | 'too_short' | 'too_long' | 'all_symbols' | 'invalid_char';

export const CHARACTER_NAME_ERROR_MESSAGES: Record<CharacterNameError, string> = {
  empty: '請輸入角色名稱',
  too_short: `名稱至少 ${CHARACTER_NAME_MIN_LENGTH} 個字`,
  too_long: `名稱最多 ${CHARACTER_NAME_MAX_LENGTH} 個字`,
  all_symbols: '名稱不可全部都是符號，至少要有一個中文、英文或數字',
  invalid_char: `名稱只能使用中文、英文、數字與 ${CHARACTER_NAME_ALLOWED_SYMBOLS} 這些符號，不可有空白`,
};

/** NFC 正規化，避免組合字與預組字被視為不同名稱 */
export function normalizeCharacterName(name: string): string {
  return name.normalize('NFC');
}

/** 唯一性判定用的 key，與伺服端 name_key 定義一致（NFC + 小寫） */
export function characterNameKey(name: string): string {
  return normalizeCharacterName(name).toLowerCase();
}

/** 名稱中允許出現的所有字元（含符號） */
const ALLOWED_CHAR_PATTERN = /^[A-Za-z0-9一-龥\-_~=.]+$/;
/** 至少要有一個中英數 */
const HAS_ALNUM_PATTERN = /[A-Za-z0-9一-龥]/;

/** 通過回傳 null，否則回傳錯誤代碼 */
export function validateCharacterName(name: string): CharacterNameError | null {
  const normalized = normalizeCharacterName(name);
  if (normalized.length === 0) return 'empty';
  if (CHARACTER_NAME_PATTERN.test(normalized)) return null;

  // 依序判斷，讓提示指向真正的問題而不是一律回「字元不合法」
  if (normalized.length < CHARACTER_NAME_MIN_LENGTH) return 'too_short';
  if (normalized.length > CHARACTER_NAME_MAX_LENGTH) return 'too_long';
  if (!ALLOWED_CHAR_PATTERN.test(normalized)) return 'invalid_char';
  if (!HAS_ALNUM_PATTERN.test(normalized)) return 'all_symbols';
  return 'invalid_char';
}

/**
 * 產生角色的全球唯一 ID。
 * `crypto.randomUUID` 需要 secure context，非 https 的本機測試環境會缺席，故留 fallback。
 */
export function generateCharacterUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
