/** 裝備欄詞綴加總（`34-ui-guidelines.md`「裝備欄詞綴加總」） */
import { describe, it, expect } from 'vitest';
import { summarizeAffixes } from '../affixSummary';
import type { EquipmentInstance } from '../../models/equipment';
import type { Affix } from '../../models/affix';
import type { UniqueAffix } from '../../models/uniqueAffix';

let nextId = 1;
function item(slot: string, affixes: Affix[], extra: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    id: nextId++, templateId: 1, name: slot, type: 'armor', slot, isTwoHanded: false,
    defense: 0, quality: 0, enhancement: 0, affixes, ownerId: 1, equipped: true, ...extra,
  } as EquipmentInstance;
}

describe('summarizeAffixes', () => {
  it('同種加總、依詞綴定義排序；百分比一位小數，固定值與迴避值整數', () => {
    const rows = summarizeAffixes([
      item('helmet', [{ type: 'defense', tier: 3, value: 7.2 }, { type: 'max_hp', tier: 3, value: 40 }]),
      item('chest', [{ type: 'defense', tier: 4, value: 10 }, { type: 'evasion', tier: 7, value: 250 }]),
      item('rightHand', [{ type: 'crit_rate', tier: 5, value: 14.3 }], { type: 'sword' }),
    ]);
    expect(rows).toEqual([
      { name: '爆擊率', value: '+14.3%' },
      { name: '防禦力', value: '+17.2%' },
      { name: '最大 HP', value: '+40' },
      { name: '迴避', value: '+250' },
    ]);
  });

  it('品質放大後才加總', () => {
    const rows = summarizeAffixes([item('chest', [{ type: 'defense', tier: 4, value: 10 }], { quality: 20 })]);
    expect(rows).toEqual([{ name: '防禦力', value: '+12.0%' }]);
  });

  it('元素刻印帶武器元素', () => {
    const rows = summarizeAffixes([item('rightHand', [{ type: 'element_brand', tier: 3, value: 9, element: 'fire' }], { type: 'sword' })]);
    expect(rows).toEqual([{ name: '元素刻印（火）', value: '+9.0%' }]);
  });

  it('額外屬性、特殊詞綴、未併入的獨有詞綴排在最後；已併入的獨有詞綴算進同名加總', () => {
    const block: UniqueAffix = { type: 'struck_block', value: 10 };
    const rows = summarizeAffixes([
      item('helmet', [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' }, { type: 'immune_poison', tier: 0, value: 0 }]),
      item('leftHand', [], { type: 'shield', uniqueAffix: block }),
      item('rightHand', [{ type: 'crit_rate', tier: 5, value: 14 }], { type: 'sword', uniqueAffix: { type: 'crit_rate', value: 22 } }),
    ]);
    expect(rows).toEqual([
      { name: '爆擊率', value: '+36.0%' },
      { name: '力量', value: '+1' },
      { name: '毒免疫', value: '' },
      { name: '受擊 10% 機率格擋率 +10%，持續 5 秒', value: '' },
    ]);
  });

  it('沒有詞綴回空陣列', () => {
    expect(summarizeAffixes([item('helmet', [])])).toEqual([]);
  });
});
