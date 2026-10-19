/**
 * 救援碼格式（`97-selfhosted-server.md` § 97.5）：`<帳號 ID>-XXXX-XXXX-XXXX-XXXX`，
 * 隨機部分 16 字 Crockford Base32（80 bits）。
 */
import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECRET_LENGTH = 16;
const GROUP_SIZE = 4;
const ALIASES: Record<string, string> = { O: '0', I: '1', L: '1' };

export interface ParsedRecoveryCode {
  userId: number;
  secret: string;
}

function randomSecret(): string {
  const bytes = randomBytes((SECRET_LENGTH * 5) / 8);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >> bits) & 31];
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

/** 回傳顯示給玩家的完整救援碼與要雜湊的 secret */
export function generateRecoveryCode(userId: number): { code: string; secret: string } {
  const secret = randomSecret();
  const groups = secret.match(new RegExp(`.{${GROUP_SIZE}}`, 'g'))!;
  return { code: `${userId}-${groups.join('-')}`, secret };
}

/** 格式不符回傳 null */
export function parseRecoveryCode(input: string): ParsedRecoveryCode | null {
  const match = /^\s*(\d+)\s*-(.*)$/s.exec(input);
  if (!match) return null;
  const userId = Number(match[1]);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const secret = [...match[2].toUpperCase().replace(/[\s-]/g, '')].map(c => ALIASES[c] ?? c).join('');
  if (secret.length !== SECRET_LENGTH || [...secret].some(c => !ALPHABET.includes(c))) return null;
  return { userId, secret };
}
