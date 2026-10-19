import { describe, it, expect } from 'vitest';
import { generateRecoveryCode, parseRecoveryCode } from '../recoveryCode';

/** 救援碼格式（`97-selfhosted-server.md` § 97.5） */
describe('救援碼格式', () => {
  it('帳號 ID 加四段四字 Crockford Base32', () => {
    const { code, secret } = generateRecoveryCode(42);
    expect(code).toMatch(/^42-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(secret).toHaveLength(16);
    expect(code.replace(/^42-/, '').replace(/-/g, '')).toBe(secret);
  });

  it('每次產生都不同', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRecoveryCode(1).secret));
    expect(codes.size).toBe(50);
  });

  it('解析回帳號 ID 與 secret', () => {
    const { code, secret } = generateRecoveryCode(7);
    expect(parseRecoveryCode(code)).toEqual({ userId: 7, secret });
  });

  it('不分大小寫、忽略空白與 -，O 視為 0、I／L 視為 1', () => {
    expect(parseRecoveryCode(' 3-abcd efgh-o0il-1234 ')).toEqual({ userId: 3, secret: 'ABCDEFGH00111234' });
    expect(parseRecoveryCode('3-ABCDEFGH00111234')).toEqual({ userId: 3, secret: 'ABCDEFGH00111234' });
  });

  it('格式不符回傳 null', () => {
    expect(parseRecoveryCode('')).toBeNull();
    expect(parseRecoveryCode('ABCD-EFGH-JKMN-PQRS')).toBeNull();
    expect(parseRecoveryCode('0-ABCD-EFGH-JKMN-PQRS')).toBeNull();
    expect(parseRecoveryCode('3-ABCD-EFGH-JKMN-PQR')).toBeNull();
    expect(parseRecoveryCode('3-ABCD-EFGH-JKMN-PQRSU')).toBeNull();
    expect(parseRecoveryCode('3-ABCD-EFGH-JKMN-PQRU')).toBeNull();
  });
});
