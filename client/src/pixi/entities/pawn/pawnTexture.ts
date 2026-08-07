/**
 * 把角色剪影烘成貼圖 —— 每個造型 × 4 朝向各一張，建立時烘一次。
 *
 * 一個造型是幾十條 bezier，每幀重畫等於把 CPU 花在畫同一張圖上；
 * 造型在遊戲中不會改變，所以烘完之後只換 texture
 * （`40-pixijs-migration.md` § 10）。
 */
import { Texture } from 'pixi.js';
import type { Appearance } from '../../../models/appearance';
import { drawPawn, type PawnContext, type PawnLook } from './drawPawn';
import { resolveCapCfg } from './hairRender';
import {
  PAWN_GEOM,
  PAWN_DIRECTION_BY_ID,
  type PawnDirectionId,
  type PawnGeom,
} from './geometry';

/**
 * 貼圖尺寸與腳底錨點。
 *
 * 數字來自實測：13 髮型 × 4 朝向、睫毛與微調都推到極值時，
 * 相對腳底原點的外框是 x ±20.25、y −49.25 ~ +1.25（不含地面陰影）。
 * 四邊各留約 4px 餘裕。`pawnBounds.test.ts` 會在髮型或參數改動時重新檢查。
 */
export const PAWN_TEX_W = 48;
export const PAWN_TEX_H = 56;
/** 腳底（＝所站地磚中心）在貼圖裡的位置 */
export const PAWN_ANCHOR_X = 24;
export const PAWN_ANCHOR_Y = 54;

/** 超取樣倍率：烘大一倍再縮著用，鏡頭拉近時才不會糊 */
export const PAWN_BAKE_SCALE = 2;

/** 地面陰影由地圖那層負責，不烘進角色貼圖 —— 烘進去會跟著角色一起被排序遮擋 */
const BAKE_GEOM: PawnGeom = { ...PAWN_GEOM, shadow: 0 };

/**
 * 把存檔的外觀轉成繪製用的造型。
 *
 * `clothOverride` 是留給裝備的口子：目前衣色是**內衣**、屬於外觀資料，
 * 等裝備外觀做出來之後才會有東西蓋過它（`04-character.md` § 4.10）。
 */
export function toPawnLook(appearance: Appearance, clothOverride?: string): PawnLook {
  return {
    hair: appearance.hair,
    skin: appearance.skin,
    hairColor: appearance.hairColor,
    eyeColor: appearance.eyeColor,
    lash: appearance.lash,
    cloth: clothOverride ?? appearance.cloth,
    cap: resolveCapCfg(appearance.hair, appearance.tune[appearance.hair]),
  };
}

/**
 * 快取的鍵。**必須涵蓋每一個會影響畫面的欄位** ——
 * 漏掉一個，換了那個欄位的角色會拿到前一個造型的貼圖，而且不會報錯。
 */
export function pawnLookKey(look: PawnLook, dirId: PawnDirectionId): string {
  const { cap, lash } = look;
  return [
    dirId, look.hair, look.skin, look.hairColor, look.eyeColor, look.cloth,
    look.eyes ?? 'dots',
    lash.on, lash.len, lash.curl, lash.w,
    cap.front, cap.back, cap.sideFront, cap.sideHold, cap.swoop,
    cap.bangLen, cap.bangW, cap.peak, cap.mDip,
  ].join('|');
}

const cache = new Map<string, Texture>();

/** 把一個造型畫進新的離屏畫布 */
function bakeCanvas(look: PawnLook, dirId: PawnDirectionId): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PAWN_TEX_W * PAWN_BAKE_SCALE;
  canvas.height = PAWN_TEX_H * PAWN_BAKE_SCALE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('取不到 2D context，無法烘焙角色貼圖');

  ctx.setTransform(PAWN_BAKE_SCALE, 0, 0, PAWN_BAKE_SCALE, 0, 0);
  drawPawn(
    ctx as unknown as PawnContext,
    PAWN_ANCHOR_X, PAWN_ANCHOR_Y,
    PAWN_DIRECTION_BY_ID[dirId],
    look,
    BAKE_GEOM,
  );
  return canvas;
}

/**
 * 取得某造型某朝向的貼圖。同一個造型只烘一次，之後共用同一張 ——
 * 城鎮裡十幾個 NPC 常常只有幾種造型。
 */
export function getPawnTexture(look: PawnLook, dirId: PawnDirectionId): Texture {
  const key = pawnLookKey(look, dirId);
  const hit = cache.get(key);
  if (hit) return hit;

  const texture = Texture.from(bakeCanvas(look, dirId));
  cache.set(key, texture);
  return texture;
}

/** 測試與熱重載用。正常執行期間不需要清 —— 造型數量本來就有限 */
export function clearPawnTextureCache(): void {
  for (const texture of cache.values()) texture.destroy(true);
  cache.clear();
}

/** 目前快取了幾張，測試用來確認「同造型不重烘」 */
export function pawnTextureCacheSize(): number {
  return cache.size;
}
