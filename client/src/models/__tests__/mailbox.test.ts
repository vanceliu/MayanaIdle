import { describe, it, expect } from 'vitest';
import { planMailDedupe, talentSlotGrantKey, type Mail } from '../mailbox';

const CHAR = 1;

function mail(id: number, key: string, claimed: boolean, characterId = CHAR): Mail {
  return {
    id,
    characterId,
    sourceKey: key,
    title: key,
    items: [{ type: 'talent_slot', slotTier: 1 }],
    createdAt: 1000 + id,
    claimedAt: claimed ? 2000 + id : null,
  };
}

/*
 * v19 之前拿信箱當「發過了」的證據，換版清理一刪就整批重發（§ 52.2.3）。
 * 修程式不會讓已經存在的重複資料消失，要對一次帳。
 */
describe('重複發放對帳（§ 52.2.3）', () => {
  const K1 = talentSlotGrantKey(1);
  const K2 = talentSlotGrantKey(2);

  it('沒有重複時什麼都不動', () => {
    const { drop, extraClaims } = planMailDedupe([mail(1, K1, true), mail(2, K2, false)]);
    expect(drop).toEqual([]);
    expect(extraClaims.size).toBe(0);
  });

  it('重複的只留一封', () => {
    const { drop } = planMailDedupe([mail(1, K1, false), mail(2, K1, false), mail(3, K1, false)]);
    expect(drop).toEqual([2, 3]);
  });

  // 領過的信不可刪除（刪掉等於抹掉領取紀錄）
  it('有領過的話留領過的那封', () => {
    const { drop } = planMailDedupe([mail(1, K1, false), mail(2, K1, true)]);
    expect(drop).toEqual([1]);
  });

  it('只有一封領過＝沒有多拿', () => {
    const { extraClaims } = planMailDedupe([mail(1, K1, true), mail(2, K1, false)]);
    expect(extraClaims.size).toBe(0);
  });

  it('兩封都領過＝真的多拿一個', () => {
    const { drop, extraClaims } = planMailDedupe([mail(1, K1, true), mail(2, K1, true)]);
    expect(drop).toEqual([2]);
    expect(extraClaims.get(CHAR)).toBe(1);
  });

  it('多個 sourceKey 各自累加', () => {
    const { extraClaims } = planMailDedupe([
      mail(1, K1, true), mail(2, K1, true),
      mail(3, K2, true), mail(4, K2, true), mail(5, K2, true),
    ]);
    expect(extraClaims.get(CHAR)).toBe(3);
  });

  // 兩隻角色收到同一個 sourceKey 是正常的，不可以互相當成重複
  it('不同角色的同一個 sourceKey 不算重複', () => {
    const { drop } = planMailDedupe([mail(1, K1, true), mail(2, K1, true, 2)]);
    expect(drop).toEqual([]);
  });
});
