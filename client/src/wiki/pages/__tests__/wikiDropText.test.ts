import { describe, it, expect } from 'vitest';
import { formatRatePercent, getAreaDropRateText, getDropRate } from '../../hooks/useWikiData';
import { getAcquireLabel } from '../../acquireLabel';
import { SKILL_BOOK_BOSS_DROP_RATE, SKILL_BOOK_NORMAL_DROP_RATE } from '../../../systems/classSkillBookDrop';
import { DUNGEON_SCROLL_DROP_VALUE_CAP } from '../../../systems/drops';

/** Wiki 掉率與取得方式文字（`43-wiki-system.md` § 4.1／§ 4.3／§ 4.5） */
describe('formatRatePercent', () => {
  it('技能書掉率不四捨五入成錯的值', () => {
    expect(formatRatePercent(SKILL_BOOK_BOSS_DROP_RATE)).toBe('2.5%');
    expect(formatRatePercent(SKILL_BOOK_NORMAL_DROP_RATE)).toBe('0.025%');
  });
});

describe('getAreaDropRateText', () => {
  it('有 dropValueMax 的道具顯示區間', () => {
    expect(getAreaDropRateText({ itemType: 'item', itemTemplateId: 2, dropValue: 50, dropValueMax: 100 }))
      .toBe(`${getDropRate(50)}～${getDropRate(100)}`);
  });

  it('百柱塔卷軸最多 ×2、上限 10%', () => {
    expect(getAreaDropRateText({ itemType: 'item', itemTemplateId: 95, dropValue: 30 })).toBe(`${getDropRate(30)}～${getDropRate(60)}`);
    expect(getAreaDropRateText({ itemType: 'item', itemTemplateId: 95, dropValue: 80 }))
      .toBe(`${getDropRate(80)}～${getDropRate(DUNGEON_SCROLL_DROP_VALUE_CAP)}`);
  });

  it('沒有區間時照原值', () => {
    expect(getAreaDropRateText({ itemType: 'item', itemTemplateId: 2, dropValue: 50 })).toBe(getDropRate(50));
    expect(getAreaDropRateText({ itemType: 'equipment', dropValue: 10 })).toBe(getDropRate(10));
  });
});

describe('getAcquireLabel', () => {
  it('新手裝不掉落；商店裝與製作裝也會掉落', () => {
    expect(getAcquireLabel({ acquireType: 'starter' })).toBe('新手裝');
    expect(getAcquireLabel({ acquireType: 'shop' })).toBe('商店／掉落');
    expect(getAcquireLabel({ acquireType: 'craft' })).toBe('製作／掉落');
    expect(getAcquireLabel({ acquireType: 'drop_only' })).toBe('掉落');
  });
});
