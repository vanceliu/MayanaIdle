/**
 * 角色身分：全球唯一 ID 與名稱規則
 * 規格見 `docs/design/19-account-character.md` § 19.4
 *
 * client 的驗證只是 UX，真正把關的是 server（建角時再驗一次，並查名稱唯一索引）。
 */

/**
 * § 19.4：中英數 + 符號 `- _ ~ = .`，符號可放在任何位置（含開頭與結尾）。
 * 長度以寬度計：中文佔 2、其餘佔 1，寬 2~12（最多 6 個中文或 12 個半形字）。
 *
 * 兩條實質限制：
 * 1. 不可全部都是符號
 * 2. 不可有空白（含全形）
 *
 * 不開放：`< > & " '`、`/ \ %`、`| , ;`、`+ * ?`、emoji 與控制字元。
 */

/** 名稱中允許使用的符號，供錯誤訊息與文件引用 */
export const CHARACTER_NAME_ALLOWED_SYMBOLS = '-_~=.';
export const CHARACTER_NAME_MIN_WIDTH = 2;
export const CHARACTER_NAME_MAX_WIDTH = 12;

export type CharacterNameError = 'empty' | 'too_short' | 'too_long' | 'all_symbols' | 'invalid_char';

export const CHARACTER_NAME_ERROR_MESSAGES: Record<CharacterNameError, string> = {
  empty: '請輸入角色名稱',
  too_short: '名稱至少 1 個中文或 2 個英數字',
  too_long: '名稱最多 6 個中文或 12 個英數字（中文算 2 格）',
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

/** 佔寬 2 的字元：允許字元裡只有中文 */
const WIDE_CHAR_PATTERN = /[一-龥]/;

/** 名稱寬度：中文 2、其餘 1 */
export function nameWidth(name: string): number {
  let width = 0;
  for (const ch of normalizeCharacterName(name)) width += WIDE_CHAR_PATTERN.test(ch) ? 2 : 1;
  return width;
}

/** 名稱中允許出現的所有字元（含符號） */
const ALLOWED_CHAR_PATTERN = /^[A-Za-z0-9一-龥\-_~=.]+$/;
/** 至少要有一個中英數 */
const HAS_ALNUM_PATTERN = /[A-Za-z0-9一-龥]/;

/** § 19.4 的字元規則套上指定寬度；公會名稱（`11-guild.md` § 11.4）共用 */
export function validateNameWidth(name: string, min: number, max: number): CharacterNameError | null {
  const normalized = normalizeCharacterName(name);
  if (normalized.length === 0) return 'empty';

  // 依序判斷，讓提示指向真正的問題而不是一律回「字元不合法」
  const width = nameWidth(normalized);
  if (width < min) return 'too_short';
  if (width > max) return 'too_long';
  if (!ALLOWED_CHAR_PATTERN.test(normalized)) return 'invalid_char';
  if (!HAS_ALNUM_PATTERN.test(normalized)) return 'all_symbols';
  return null;
}

/** 通過回傳 null，未通過回傳錯誤代碼 */
export function validateCharacterName(name: string): CharacterNameError | null {
  return validateNameWidth(name, CHARACTER_NAME_MIN_WIDTH, CHARACTER_NAME_MAX_WIDTH);
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
