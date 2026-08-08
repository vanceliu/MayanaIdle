/**
 * 把武器剪影烘成貼圖 —— 每個「武器類型 × 材質」各一張，用到才烘。
 *
 * 與角色同一個理由（`40-pixijs-migration.md` § 10）：形狀在遊戲中不會改變，
 * 每幀重畫等於把 CPU 花在畫同一張圖上。
 *
 * ── 為什麼貼圖是「指向正上方」的姿勢 ──
 * 揮擊靠 sprite 的 `rotation` 與位置表達（`weaponPose()` 回傳的就是那兩個值），
 * 所以貼圖只需要一個姿勢。把旋轉畫進路徑的話，每個角度都要烘一張。
 *
 * ── 快取鍵為什麼不是只有類型 ──
 * `lead`（刃口朝哪一側）只有不對稱的形狀吃得到；`pull`（拉弦）只有弓吃得到。
 * 無關的武器不把它們放進鍵裡，否則對稱的劍會憑空多烘一倍。
 */
import { Texture } from 'pixi.js';
import type { WeaponMaterial } from '../../../models/equipment';
import { drawWeapon } from './drawWeapon';
import type { PawnContext } from './drawPawn';
import {
  WEAPON_ART,
  weaponColors,
  type PawnWeaponType,
  type WeaponParams,
} from './weaponGeometry';

/**
 * 貼圖尺寸與握點在貼圖裡的位置。
 *
 * 數字來自實測：十把武器 × 刃口兩側 × 拉弦三態，相對握點的外框是
 * x −10.8 ~ +19.5、y −36.5 ~ +14.2。四邊各留餘裕，
 * `weaponTexture.test.ts` 會在形狀參數改動時重新檢查。
 */
export const WEAPON_TEX_W = 48;
export const WEAPON_TEX_H = 62;
/** 握點（sprite 的旋轉中心）在貼圖裡的位置 */
export const WEAPON_ANCHOR_X = 24;
export const WEAPON_ANCHOR_Y = 44;

/** 超取樣倍率：烘大一倍再縮著用，鏡頭拉近時才不會糊 */
export const WEAPON_BAKE_SCALE = 2;

/**
 * 弓的拉弦量量化成幾段。
 *
 * 拉弦全程約 160ms，60fps 下只有十來幀 —— 八段已經看不出跳格，
 * 而每多一段就是每個材質多烘一張。
 */
export const WEAPON_PULL_STEPS = 8;

/**
 * 這把武器的形狀吃不吃 `lead`（刃口朝弧線前進的哪一側）。
 *
 * 左右對稱的形狀（劍、鈍器、杖、弓）翻過來長得一樣，
 * 把 lead 放進快取鍵只會讓它們憑空多烘一張。
 */
export function weaponUsesLead(params: WeaponParams): boolean {
  if (params.shape === 'claw') return true;
  /* 雙刃斧兩側都有刃，翻不翻一樣 */
  return params.shape === 'axe' && !params.double;
}

/** 這把武器的形狀吃不吃 `pull`（拉弦） */
export function weaponUsesPull(params: WeaponParams): boolean {
  return params.shape === 'bow';
}

/** 把 0~1 的拉弦量夾進 `WEAPON_PULL_STEPS` 段 */
export function quantizePull(pull: number): number {
  const clamped = pull < 0 ? 0 : pull > 1 ? 1 : pull;
  return Math.round(clamped * (WEAPON_PULL_STEPS - 1)) / (WEAPON_PULL_STEPS - 1);
}

/**
 * 快取鍵。**必須涵蓋每一個會影響畫面的欄位** ——
 * 漏掉一個，換了那個欄位的武器會拿到前一個的貼圖，而且不會報錯。
 */
export function weaponTextureKey(
  type: PawnWeaponType,
  material: WeaponMaterial | null | undefined,
  lead: 1 | -1,
  pull: number,
): string {
  const { params } = WEAPON_ART[type];
  const l = weaponUsesLead(params) ? lead : 0;
  const p = weaponUsesPull(params) ? quantizePull(pull) : 0;
  return `${type}|${material ?? 'default'}|${l}|${p}`;
}

const cache = new Map<string, Texture>();

function bakeCanvas(
  type: PawnWeaponType,
  material: WeaponMaterial | null | undefined,
  lead: 1 | -1,
  pull: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WEAPON_TEX_W * WEAPON_BAKE_SCALE;
  canvas.height = WEAPON_TEX_H * WEAPON_BAKE_SCALE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('取不到 2D context，無法烘焙武器貼圖');

  ctx.setTransform(WEAPON_BAKE_SCALE, 0, 0, WEAPON_BAKE_SCALE, 0, 0);
  const art = WEAPON_ART[type];
  drawWeapon(
    ctx as unknown as PawnContext,
    WEAPON_ANCHOR_X, WEAPON_ANCHOR_Y,
    art.params,
    weaponColors(material),
    art.geom,
    weaponUsesPull(art.params) ? quantizePull(pull) : 0,
    lead,
  );
  return canvas;
}

/** 取得某把武器某材質的貼圖。同一組只烘一次 */
export function getWeaponTexture(
  type: PawnWeaponType,
  material: WeaponMaterial | null | undefined,
  lead: 1 | -1 = 1,
  pull = 0,
): Texture {
  const key = weaponTextureKey(type, material, lead, pull);
  const hit = cache.get(key);
  if (hit) return hit;

  const texture = Texture.from(bakeCanvas(type, material, lead, pull));
  cache.set(key, texture);
  return texture;
}

/** 測試與熱重載用。正常執行期間不需要清 —— 組合數量本來就有限 */
export function clearWeaponTextureCache(): void {
  for (const texture of cache.values()) texture.destroy(true);
  cache.clear();
}

/** 目前快取了幾張，測試用來確認「同組合不重烘」 */
export function weaponTextureCacheSize(): number {
  return cache.size;
}
