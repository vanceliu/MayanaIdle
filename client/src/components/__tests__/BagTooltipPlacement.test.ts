import { describe, it, expect } from 'vitest';
import { placeBagTooltip } from '../BagTooltip';

/**
 * 背包詳情框的落點（`35-inventory-constraints.md` § 35.6.4「自動偵測邊界翻轉」）。
 *
 * 這是最容易只在特定螢幕高度才出錯的東西：一般解析度下永遠貼在格子下方，
 * 只有最後一排格子才會翻上去，所以要逐個邊界釘住。
 */

const VIEWPORT = { width: 1000, height: 800 };
const SIZE = { width: 220, height: 120 };

/** 左上角在 (x, y) 的 40×40 格子 */
const cell = (x: number, y: number) => ({ left: x, right: x + 40, top: y, bottom: y + 40 });

describe('背包詳情框落點', () => {
  it('預設貼在格子下方', () => {
    expect(placeBagTooltip(cell(100, 100), SIZE, VIEWPORT)).toEqual({ x: 100, y: 148 });
  });

  it('下方放不下就翻到格子上方', () => {
    // 格子底 740 ＋ 間距 8 ＋ 高 120 = 868 > 800
    const pos = placeBagTooltip(cell(100, 700), SIZE, VIEWPORT);
    expect(pos.y).toBe(700 - 8 - 120);
  });

  it('剛好放得下就不翻', () => {
    // 格子底 630 ＋ 8 ＋ 120 = 758，還在 800 - 4 之內
    expect(placeBagTooltip(cell(100, 590), SIZE, VIEWPORT).y).toBe(638);
  });

  it('上下都放不下時貼齊下緣，不溢出畫面', () => {
    const tall = { width: 220, height: 780 };
    const pos = placeBagTooltip(cell(100, 400), tall, VIEWPORT);
    expect(pos.y).toBe(800 - 4 - 780);
    expect(pos.y).toBeGreaterThanOrEqual(4);
  });

  it('靠右的格子改成靠右對齊', () => {
    // 格子右緣 980，往右展開會超出 1000
    expect(placeBagTooltip(cell(940, 100), SIZE, VIEWPORT).x).toBe(980 - 220);
  });

  it('靠左夾住，不會出現負座標', () => {
    expect(placeBagTooltip(cell(0, 100), { width: 220, height: 120 }, { width: 200, height: 800 }).x).toBe(4);
  });
});
