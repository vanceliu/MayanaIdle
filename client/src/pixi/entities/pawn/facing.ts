import type { PawnDirectionId } from './geometry';
import { TILE_H, TILE_W } from '../../utils/isometric';

/**
 * 移動方向 → 朝向。
 *
 * 朝向**由位移推算，不另外存一份狀態**（`40-pixijs-migration.md` § 10）——
 * 存了就會有「存的朝向與實際走向不一致」的同步問題。
 *
 * 判斷用的是**螢幕上的方向**，而且要先套上等距投影：
 * 地磚是 2:1（`TILE_W` / `TILE_H`），同樣的世界位移在螢幕上水平走得比垂直遠一倍。
 *
 * 只比 `x−y` 與 `x+y`（不乘地磚尺寸）的話，四個世界軸方向永遠平手，
 * 平手一律倒向上下 —— 結果是八個方向裡有六個畫成正面／背面，
 * 側身只在兩個斜角出現。
 */
export function facingFromDelta(dx: number, dy: number): PawnDirectionId | null {
  return facingFromScreen((dx - dy) * (TILE_W / 2), (dx + dy) * (TILE_H / 2));
}

/**
 * 螢幕位移 → 朝向。**角色朝向與武器揮向共用這一條規則**
 * （武器那邊由 `weaponGeometry.ts` 的 `pawnFacingForAim()` 呼叫）——
 * 各寫一份就會出現同一個方向下「走路時正面、出手時側身」跳來跳去。
 */
export function facingFromScreen(sx: number, sy: number): PawnDirectionId | null {
  /* 幾乎沒動就維持原朝向 —— 讓呼叫端自己保留，回 null 比回一個猜的好 */
  if (Math.abs(sx) < EPSILON && Math.abs(sy) < EPSILON) return null;

  if (Math.abs(sx) > Math.abs(sy)) return sx > 0 ? 'right' : 'left';
  return sy > 0 ? 'front' : 'back';
}

/**
 * 小於這個位移就當作沒動。太小會讓角色在原地抖動時亂轉頭，
 * 太大則會在小碎步時轉不過來。
 */
const EPSILON = 1e-4;
