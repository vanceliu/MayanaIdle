import { describe, it, expect } from 'vitest';
import { facingFromDelta } from '../facing';
import { worldToScreen } from '../../../utils/isometric';

/**
 * 朝向由位移推算（`40-pixijs-migration.md` § 10）。
 *
 * 判斷依據是**螢幕上的方向**而不是世界座標軸 —— 等距投影下這兩件事不一樣，
 * 直接比世界軸的話玩家往畫面右下走會被判成「往下」。
 * 所以這裡的斷言一律拿 `worldToScreen` 的結果來對，不憑感覺。
 */
describe('facingFromDelta', () => {
  /** 世界位移換成螢幕位移，用來檢查判斷有沒有跟畫面一致 */
  function screenDelta(dx: number, dy: number) {
    const a = worldToScreen(0, 0, 0);
    const b = worldToScreen(dx, dy, 0);
    return { sx: b.sx - a.sx, sy: b.sy - a.sy };
  }

  it.each([
    ['世界 +x（螢幕右下）', 1, 0],
    ['世界 −x（螢幕左上）', -1, 0],
    ['世界 +y（螢幕左下）', 0, 1],
    ['世界 −y（螢幕右上）', 0, -1],
    ['世界 +x+y（螢幕正下）', 1, 1],
    ['世界 −x−y（螢幕正上）', -1, -1],
    ['世界 +x−y（螢幕正右）', 1, -1],
    ['世界 −x+y（螢幕正左）', -1, 1],
  ])('%s 的朝向與畫面上的移動方向一致', (_label, dx, dy) => {
    const facing = facingFromDelta(dx, dy)!;
    const { sx, sy } = screenDelta(dx, dy);

    if (facing === 'right') expect(sx).toBeGreaterThan(0);
    if (facing === 'left') expect(sx).toBeLessThan(0);
    if (facing === 'front') expect(sy).toBeGreaterThan(0);
    if (facing === 'back') expect(sy).toBeLessThan(0);

    /**
     * 選的一定是**螢幕上**比較大的那個分量 —— 不換算回世界單位。
     * 換算回去等於抵銷掉 2:1 投影，四個世界軸方向會全部平手。
     */
    if (facing === 'right' || facing === 'left') {
      expect(Math.abs(sx)).toBeGreaterThan(Math.abs(sy));
    } else {
      expect(Math.abs(sy)).toBeGreaterThanOrEqual(Math.abs(sx));
    }
  });

  it('世界軸的四個方向畫成側身 —— 它們在螢幕上是斜的，水平分量比較大', () => {
    expect(facingFromDelta(1, 0)).toBe('right');   // 螢幕右下
    expect(facingFromDelta(0, -1)).toBe('right');  // 螢幕右上
    expect(facingFromDelta(0, 1)).toBe('left');    // 螢幕左下
    expect(facingFromDelta(-1, 0)).toBe('left');   // 螢幕左上
  });

  it('與武器的揮向共用同一條規則，不會走路正面、出手側身', async () => {
    const { weaponAimFromDelta, pawnFacingForAim } = await import('../weaponGeometry');
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (const [dx, dy] of dirs) {
      expect(pawnFacingForAim(weaponAimFromDelta(dx, dy)!)).toBe(facingFromDelta(dx, dy));
    }
  });

  it('螢幕正下 / 正上 / 正右 / 正左 四個主方向各對到一個朝向', () => {
    expect(facingFromDelta(1, 1)).toBe('front');
    expect(facingFromDelta(-1, -1)).toBe('back');
    expect(facingFromDelta(1, -1)).toBe('right');
    expect(facingFromDelta(-1, 1)).toBe('left');
  });

  it('沒動就回 null，讓呼叫端保留原朝向而不是亂猜', () => {
    expect(facingFromDelta(0, 0)).toBeNull();
    expect(facingFromDelta(1e-9, -1e-9)).toBeNull();
  });

  it('位移放大不影響判斷', () => {
    expect(facingFromDelta(0.01, 0.01)).toBe('front');
    expect(facingFromDelta(100, 100)).toBe('front');
  });

  it('回傳的一定是四個合法朝向之一', () => {
    for (let dx = -3; dx <= 3; dx += 0.5) {
      for (let dy = -3; dy <= 3; dy += 0.5) {
        const f = facingFromDelta(dx, dy);
        expect(f === null || ['front', 'back', 'left', 'right'].includes(f)).toBe(true);
      }
    }
  });
});
