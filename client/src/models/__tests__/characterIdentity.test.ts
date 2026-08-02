import { describe, it, expect } from 'vitest';
import {
  validateCharacterName,
  characterNameKey,
  generateCharacterUuid,
} from '../characterIdentity';

describe('validateCharacterName（§ 19.4）', () => {
  it('接受中文、英文、數字與混合', () => {
    expect(validateCharacterName('勇者')).toBeNull();
    expect(validateCharacterName('Hero')).toBeNull();
    expect(validateCharacterName('Hero123')).toBeNull();
    expect(validateCharacterName('勇者A1')).toBeNull();
    expect(validateCharacterName('十二個字的角色名稱剛好')).toBeNull();
  });

  it('拒絕空字串與長度不足', () => {
    expect(validateCharacterName('')).toBe('empty');
    expect(validateCharacterName('A')).toBe('too_short');
    expect(validateCharacterName('王')).toBe('too_short');
  });

  it('拒絕超過 12 字', () => {
    expect(validateCharacterName('A'.repeat(13))).toBe('too_long');
    expect(validateCharacterName('超過十二個字的角色名稱範例')).toBe('too_long');
  });

  it('拒絕空白（含全形空白）', () => {
    expect(validateCharacterName('勇 者')).toBe('invalid_char');
    expect(validateCharacterName('勇　者')).toBe('invalid_char');
    expect(validateCharacterName('He ro')).toBe('invalid_char');
  });

  it('拒絕符號與 emoji', () => {
    expect(validateCharacterName('勇者!')).toBe('invalid_char');
    expect(validateCharacterName('He_ro')).toBe('invalid_char');
    expect(validateCharacterName('勇者★')).toBe('invalid_char');
    expect(validateCharacterName('勇者😀')).toBe('invalid_char');
    expect(validateCharacterName('<script>')).toBe('invalid_char');
  });
});

describe('characterNameKey', () => {
  it('大小寫不同的名稱視為同一個 key（避免 Abc / abc 併存）', () => {
    expect(characterNameKey('Hero')).toBe(characterNameKey('hERO'));
  });

  it('中文名稱維持原樣', () => {
    expect(characterNameKey('勇者')).toBe('勇者');
  });
});

describe('generateCharacterUuid', () => {
  it('產生 v4 UUID 格式', () => {
    expect(generateCharacterUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('每次產生皆不同', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateCharacterUuid()));
    expect(ids.size).toBe(50);
  });
});
