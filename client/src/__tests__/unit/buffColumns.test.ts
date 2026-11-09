import { describe, it, expect } from 'vitest';
import { buffBottomLimit, buffRowsPerColumn, splitBuffOverflow } from '../../hooks/useBuffColumns';

describe('buffRowsPerColumn（§ 24.8.1）', () => {
  it('上緣到界線放得下幾格', () => {
    // 150 → 607，格高 50、間距 4：7 格佔 7×50＋6×4＝374，8 格佔 428
    expect(buffRowsPerColumn({ top: 150, bottom: 607, slotHeight: 50, gap: 4 })).toBe(8);
    expect(buffRowsPerColumn({ top: 150, bottom: 577, slotHeight: 50, gap: 4 })).toBe(7);
  });

  it('剛好貼齊界線也算放得下', () => {
    expect(buffRowsPerColumn({ top: 0, bottom: 104, slotHeight: 50, gap: 4 })).toBe(2);
    expect(buffRowsPerColumn({ top: 0, bottom: 103, slotHeight: 50, gap: 4 })).toBe(1);
  });

  it('空間不足一格時仍至少 1 格', () => {
    expect(buffRowsPerColumn({ top: 500, bottom: 480, slotHeight: 50, gap: 4 })).toBe(1);
  });
});

describe('splitBuffOverflow', () => {
  it('兩欄放得下就全部顯示', () => {
    expect(splitBuffOverflow([1, 2, 3, 4, 5, 6], 3)).toEqual({ visible: [1, 2, 3, 4, 5, 6], overflow: 0 });
  });

  it('放不下時最後一格讓給 +N', () => {
    expect(splitBuffOverflow([1, 2, 3, 4, 5, 6, 7], 3)).toEqual({ visible: [1, 2, 3, 4, 5], overflow: 2 });
  });
});

describe('buffBottomLimit', () => {
  const columns = { left: 12, right: 100 };
  const bandTop = 900;

  it('戰鬥紀錄在下方且橫向重疊 → 以它的上緣為界', () => {
    expect(buffBottomLimit(150, columns, { left: 12, right: 500, top: 600, height: 200 }, bandTop)).toBe(600);
  });

  it('戰鬥紀錄拖到右邊 → 以下方 HUD 帶上緣為界', () => {
    expect(buffBottomLimit(150, columns, { left: 400, right: 800, top: 600, height: 200 }, bandTop)).toBe(900);
  });

  it('戰鬥紀錄在 BuffBar 上方 → 不採用', () => {
    expect(buffBottomLimit(150, columns, { left: 12, right: 500, top: 100, height: 200 }, bandTop)).toBe(900);
  });

  it('沒有戰鬥紀錄 → 以下方 HUD 帶上緣為界', () => {
    expect(buffBottomLimit(150, columns, null, bandTop)).toBe(900);
  });
});
