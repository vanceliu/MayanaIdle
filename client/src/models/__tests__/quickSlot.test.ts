import { describe, it, expect } from 'vitest';
import {
  QUICK_SLOT_COUNT,
  canQuickSlotItem,
  emptyQuickSlots,
  getEntryScrollRegion,
  getQuickSlotItemName,
  isSameQuickSlotEntry,
  normalizeQuickSlots,
  resolveQuickSlotAction,
  toQuickSlotEntry,
  quickSlotLabel,
  keyToQuickSlotIndex,
} from '../quickSlot';
import { REGIONS } from '../mapData';

describe('快捷鍵可放置的物品（§ 35.7）', () => {
  it('三種基礎藥水都可放，且轉成 potion 型別', () => {
    for (const [name, pt] of [['紅色藥水', 'red'], ['橙色藥水', 'orange'], ['白色藥水', 'white']] as const) {
      expect(canQuickSlotItem('bag', name)).toBe(true);
      expect(toQuickSlotEntry('bag', name)).toEqual({ kind: 'potion', potionType: pt });
    }
  });

  it('加速藥水與狀態解除道具可放', () => {
    for (const name of ['綠色藥水', '強化綠色藥水', '解毒藥水', '止血繃帶']) {
      expect(canQuickSlotItem('bag', name), name).toBe(true);
    }
  });

  it('回城卷軸與百柱塔通行卷軸可放', () => {
    expect(canQuickSlotItem('bag', '薄暮村回城卷軸')).toBe(true);
    expect(canQuickSlotItem('bag', '百柱塔 11F 通行卷軸')).toBe(true);
  });

  it('沒有使用行為的物品放不進去', () => {
    for (const name of ['武器強化卷軸', '防具強化卷軸', '銀礦石', '品質石', '死神碎魂']) {
      expect(canQuickSlotItem('bag', name), name).toBe(false);
      expect(toQuickSlotEntry('bag', name), name).toBeNull();
    }
  });

  it('裝備一律可放，但缺少 id 時無效', () => {
    expect(toQuickSlotEntry('equipment', '鐵劍', 7)).toEqual({ kind: 'equipment', equipmentId: 7, name: '鐵劍' });
    expect(toQuickSlotEntry('equipment', '鐵劍')).toBeNull();
  });
});

describe('快捷鍵點擊行為解析（§ 35.7）', () => {
  it('基礎藥水 → 使用藥水', () => {
    expect(resolveQuickSlotAction({ kind: 'potion', potionType: 'red' }))
      .toEqual({ type: 'potion', potionType: 'red' });
  });

  it('加速藥水 → 走 useSpeedPotion', () => {
    expect(resolveQuickSlotAction({ kind: 'bagItem', name: '綠色藥水' }))
      .toEqual({ type: 'speedPotion', speedType: 'green' });
    expect(resolveQuickSlotAction({ kind: 'bagItem', name: '強化綠色藥水' }))
      .toEqual({ type: 'speedPotion', speedType: 'enhanced-green' });
  });

  it('狀態解除道具 → 走 useCureItem', () => {
    expect(resolveQuickSlotAction({ kind: 'bagItem', name: '解毒藥水' }))
      .toEqual({ type: 'cure', name: '解毒藥水' });
  });

  it('回城卷軸 → 傳送回對應城鎮', () => {
    expect(resolveQuickSlotAction({ kind: 'bagItem', name: '艾爾薩斯回城卷軸' }))
      .toEqual({ type: 'townScroll', name: '艾爾薩斯回城卷軸' });
  });

  it('百柱塔通行卷軸 → 直飛對應區段', () => {
    const action = resolveQuickSlotAction({ kind: 'bagItem', name: '百柱塔 11F 通行卷軸' });
    expect(action).toEqual({
      type: 'travel',
      regionId: 'hundred-pillar-11-20f',
      scrollName: '百柱塔 11F 通行卷軸',
    });
  });

  it('裝備 → 換裝', () => {
    expect(resolveQuickSlotAction({ kind: 'equipment', equipmentId: 3, name: '鐵劍' }))
      .toEqual({ type: 'equip', equipmentId: 3 });
  });

  it('空格與無行為物品回 null', () => {
    expect(resolveQuickSlotAction(null)).toBeNull();
    expect(resolveQuickSlotAction({ kind: 'bagItem', name: '武器強化卷軸' })).toBeNull();
  });
});

describe('通行卷軸 → region 反查', () => {
  it('每一個設定了 entryScrollName 的區域都反查得到', () => {
    const gated = REGIONS.filter(r => r.entryScrollName);
    expect(gated.length).toBeGreaterThan(0);
    for (const r of gated) {
      expect(getEntryScrollRegion(r.entryScrollName!), r.name).toBe(r.id);
    }
  });

  it('非通行卷軸反查不到', () => {
    expect(getEntryScrollRegion('紅色藥水')).toBeUndefined();
    expect(getEntryScrollRegion('紅色藥水')).toBeUndefined();
  });
});

describe('快捷鍵設定正規化（§ 35.7）', () => {
  it('空值一律補成 10 格', () => {
    expect(normalizeQuickSlots(undefined)).toHaveLength(QUICK_SLOT_COUNT);
    expect(normalizeQuickSlots(null)).toEqual(emptyQuickSlots());
    expect(normalizeQuickSlots('not an array')).toEqual(emptyQuickSlots());
  });

  it('舊格式（5 格字串）自動轉成結構化內容並補齊到 10 格', () => {
    const out = normalizeQuickSlots(['red', null, 'orange', null, null]);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({ kind: 'potion', potionType: 'red' });
    expect(out[2]).toEqual({ kind: 'potion', potionType: 'orange' });
    expect(out[9]).toBeNull();
  });

  it('無法辨識的舊值直接丟棄，不會塞進格子', () => {
    expect(normalizeQuickSlots(['blue', 42, true])).toEqual(emptyQuickSlots());
  });

  it('規則改變後已不可用的物品會被剔除', () => {
    const out = normalizeQuickSlots([{ kind: 'bagItem', name: '武器強化卷軸' }]);
    expect(out[0]).toBeNull();
  });

  it('超過 10 格的設定只取前 10 格', () => {
    const raw = Array.from({ length: 15 }, () => 'red');
    expect(normalizeQuickSlots(raw)).toHaveLength(10);
  });
});

describe('輔助函式', () => {
  it('isSameQuickSlotEntry 依類型比對', () => {
    expect(isSameQuickSlotEntry({ kind: 'potion', potionType: 'red' }, { kind: 'potion', potionType: 'red' })).toBe(true);
    expect(isSameQuickSlotEntry({ kind: 'potion', potionType: 'red' }, { kind: 'potion', potionType: 'white' })).toBe(false);
    expect(isSameQuickSlotEntry({ kind: 'bagItem', name: 'A' }, { kind: 'bagItem', name: 'A' })).toBe(true);
    expect(isSameQuickSlotEntry({ kind: 'equipment', equipmentId: 1, name: 'X' }, { kind: 'equipment', equipmentId: 1, name: 'Y' })).toBe(true);
    expect(isSameQuickSlotEntry({ kind: 'equipment', equipmentId: 1, name: 'X' }, { kind: 'bagItem', name: 'X' })).toBe(false);
    expect(isSameQuickSlotEntry(null, null)).toBe(false);
  });

  it('getQuickSlotItemName 回顯示名稱', () => {
    expect(getQuickSlotItemName({ kind: 'potion', potionType: 'orange' })).toBe('橙色藥水');
    expect(getQuickSlotItemName({ kind: 'bagItem', name: '解毒藥水' })).toBe('解毒藥水');
    expect(getQuickSlotItemName({ kind: 'equipment', equipmentId: 1, name: '鐵劍' })).toBe('鐵劍');
  });
});

describe('鍵盤對應（§ 35.7）', () => {
  it('1~9 對應第 1~9 格', () => {
    for (let n = 1; n <= 9; n++) {
      expect(keyToQuickSlotIndex(String(n)), String(n)).toBe(n - 1);
    }
  });

  it('0 對應第 10 格', () => {
    expect(keyToQuickSlotIndex('0')).toBe(QUICK_SLOT_COUNT - 1);
  });

  it('其他按鍵不觸發', () => {
    for (const k of ['a', 'Enter', '', ' ', '10', '-1']) {
      expect(keyToQuickSlotIndex(k), k).toBeNull();
    }
  });

  it('顯示標籤與按鍵一致', () => {
    expect(quickSlotLabel(0)).toBe('1');
    expect(quickSlotLabel(8)).toBe('9');
    expect(quickSlotLabel(QUICK_SLOT_COUNT - 1)).toBe('0');
    // 每一格的標籤按下去都要回到同一格
    for (let i = 0; i < QUICK_SLOT_COUNT; i++) {
      expect(keyToQuickSlotIndex(quickSlotLabel(i)), `slot ${i}`).toBe(i);
    }
  });
});
