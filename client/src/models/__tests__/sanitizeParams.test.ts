import { describe, it, expect } from 'vitest';
import { sanitizeParams } from '../talentParams';

/** 天賦參數驗證（`97-selfhosted-server.md` § 97.2） */
describe('sanitizeParams', () => {
  it('select：值在選項內才收', () => {
    expect(sanitizeParams('refill_to_percent', { potionType: 'red', value: 80 })).toEqual({ potionType: 'red', value: 80 });
    expect(sanitizeParams('refill_to_percent', { potionType: 'gold' })).toBeNull();
  });

  it('number：在 min~max 內才收', () => {
    expect(sanitizeParams('refill_to_percent', { value: 0 })).toEqual({ value: 0 });
    expect(sanitizeParams('refill_to_percent', { value: 101 })).toBeNull();
    expect(sanitizeParams('refill_to_percent', { value: Number.NaN })).toBeNull();
  });

  it('item：存在的道具 id 才收', () => {
    expect(sanitizeParams('use_consumable', { itemId: 1 })).toEqual({ itemId: 1 });
    expect(sanitizeParams('use_consumable', { itemId: 999999 })).toBeNull();
    expect(sanitizeParams('use_consumable', { itemId: '1' })).toBeNull();
  });

  it('skill：字串才收', () => {
    expect(sanitizeParams('skill', { skillId: 'wind-blade' })).toEqual({ skillId: 'wind-blade' });
    expect(sanitizeParams('skill', { skillId: 5 })).toBeNull();
  });

  it('null／undefined 視為未設定，未定義欄位丟棄', () => {
    expect(sanitizeParams('skill', { skillId: null, type: 'buy_item', extra: 1 })).toEqual({});
  });

  it('沒有參數定義的規則：所有欄位丟棄', () => {
    expect(sanitizeParams('no-such-rule', { anything: 1 })).toEqual({});
  });

  it.each([null, 'x', 5, [1]])('參數不是物件（%j）：回 null', params => {
    expect(sanitizeParams('skill', params)).toBeNull();
  });
});
