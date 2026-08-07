import type { PawnDirectionId } from './geometry';

/**
 * 移動方向 → 朝向。
 *
 * 朝向**由位移推算，不另外存一份狀態**（`40-pixijs-migration.md` § 10）——
 * 存了就會有「存的朝向與實際走向不一致」的同步問題。
 *
 * 判斷用的是**螢幕上的方向**而不是世界座標軸：等距投影下
 * 螢幕往下 = x+y 變大、螢幕往右 = x−y 變大，
 * 所以直接比世界軸的話，玩家往畫面右下走會被判成「往下」。
 */
export function facingFromDelta(dx: number, dy: number): PawnDirectionId | null {
  const down = dx + dy;   // 螢幕垂直分量
  const right = dx - dy;  // 螢幕水平分量

  /* 幾乎沒動就維持原朝向 —— 讓呼叫端自己保留，回 null 比回一個猜的好 */
  if (Math.abs(down) < EPSILON && Math.abs(right) < EPSILON) return null;

  if (Math.abs(right) > Math.abs(down)) return right > 0 ? 'right' : 'left';
  return down > 0 ? 'front' : 'back';
}

/**
 * 小於這個位移就當作沒動。太小會讓角色在原地抖動時亂轉頭，
 * 太大則會在小碎步時轉不過來。
 */
const EPSILON = 1e-4;
