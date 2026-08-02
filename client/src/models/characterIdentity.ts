/**
 * 角色身分：全球唯一 ID 與名稱規則
 * 規格見 `docs/design/19-account-character.md` § 19.4
 *
 * 此處的規則必須與 `leaderboard-worker/src/index.js` 的 NAME_PATTERN / validateName 一致，
 * 客戶端驗證只是 UX，伺服端會再驗一次。
 */

/** § 19.4：中英數，2~12 字，禁止符號與空白 */
export const CHARACTER_NAME_PATTERN = /^[A-Za-z0-9一-龥]{2,12}$/;
export const CHARACTER_NAME_MIN_LENGTH = 2;
export const CHARACTER_NAME_MAX_LENGTH = 12;

export type CharacterNameError = 'empty' | 'too_short' | 'too_long' | 'invalid_char';

export const CHARACTER_NAME_ERROR_MESSAGES: Record<CharacterNameError, string> = {
  empty: '請輸入角色名稱',
  too_short: `名稱至少 ${CHARACTER_NAME_MIN_LENGTH} 個字`,
  too_long: `名稱最多 ${CHARACTER_NAME_MAX_LENGTH} 個字`,
  invalid_char: '名稱只能使用中文、英文或數字，不可有符號或空白',
};

/** NFC 正規化，避免組合字與預組字被視為不同名稱 */
export function normalizeCharacterName(name: string): string {
  return name.normalize('NFC');
}

/** 唯一性判定用的 key，與伺服端 name_key 定義一致（NFC + 小寫） */
export function characterNameKey(name: string): string {
  return normalizeCharacterName(name).toLowerCase();
}

/** 通過回傳 null，否則回傳錯誤代碼 */
export function validateCharacterName(name: string): CharacterNameError | null {
  const normalized = normalizeCharacterName(name);
  if (normalized.length === 0) return 'empty';
  if (CHARACTER_NAME_PATTERN.test(normalized)) return null;
  // 長度先判，讓提示更精確；其餘一律歸為字元不合法
  if (normalized.length < CHARACTER_NAME_MIN_LENGTH) return 'too_short';
  if (normalized.length > CHARACTER_NAME_MAX_LENGTH) return 'too_long';
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
