/**
 * 調校頁與創角模擬頁共用的橋接層。
 *
 * 繪製本體在 `client/src/pixi/entities/pawn/` —— **遊戲跑的是同一份**。
 * demo 曾經自帶一份 `pawn-draw.js`，兩邊各改各的就會分岔，
 * 所以那份已經刪掉，這裡只做三件事：
 *
 * 1. 把遊戲端的名字接成 demo 頁原本用的名字
 * 2. 補上只有 demo 需要的東西（地磚、現況圓圈、造型預設）
 * 3. `drawPawn` 包一層：沒傳 `cap` 時就用該髮型自己的 capCfg
 *
 * 第 3 點是 demo 與遊戲的差別所在。調校頁的滑桿**直接改** `HAIR_RENDER`
 * 裡那個髮型的 capCfg（那正是它的用途）；遊戲端相反，一律用
 * `resolveCapCfg()` 算出一份新的傳進去，不動共用設定。
 */
import {
  drawPawn as drawPawnCore,
  type PawnContext,
  type PawnLook,
} from '../src/pixi/entities/pawn/drawPawn';
import { HAIR_RENDER, resolveCapCfg } from '../src/pixi/entities/pawn/hairRender';
import { PAWN_GEOM, PAWN_DIRECTIONS, EYE_COLOR_DEFAULT } from '../src/pixi/entities/pawn/geometry';
import { HAIR_STYLES, DEFAULT_LASH, type HairStyleId } from '../src/models/appearance';
import type { PawnDirection } from '../src/pixi/entities/pawn/geometry';

export { HAIR_STYLES, DEFAULT_LASH, EYE_COLOR_DEFAULT, resolveCapCfg };
export const HAIR_STYLE_BY_ID = HAIR_RENDER;
export const DEFAULT_GEOM = PAWN_GEOM;
export const DIRS = PAWN_DIRECTIONS;

/** 地圖常數 —— 與 `src/pixi/utils/isometric.ts` 同步 */
export const TILE_W = 64;
export const TILE_H = 32;

/** 現況的圓圈半徑（`PlayerEntity.ts`），只用於「並排現況」對照 */
const CIRCLE_RADIUS = TILE_H * 0.45;

type DemoLook = Omit<PawnLook, 'cap' | 'lash'> & {
  cap?: PawnLook['cap'];
  /** demo 的造型預設只寫想改的那幾項，其餘補預設 */
  lash?: Partial<PawnLook['lash']>;
};

/**
 * 補齊 demo 頁習慣省略的欄位再交給繪製本體：
 *   cap  沒指定就取該髮型當下的 capCfg —— 調校頁的滑桿改的就是那個物件
 *   lash 只寫了一半就補上預設（`{ on: 1 }` 這種）
 *
 * 遊戲端不做這種補齊：少一個欄位就是 NaN，而 canvas 會**靜默丟掉**含 NaN 的
 * path 指令，只表現成「參數沒作用」。所以本體要求傳完整的，寬鬆只放在這一層。
 */
export function drawPawn(
  ctx: PawnContext,
  gx: number, gy: number,
  dir: PawnDirection,
  look: DemoLook,
  g = PAWN_GEOM,
): void {
  const hair = (HAIR_RENDER[look.hair] ? look.hair : 'bald') as HairStyleId;
  drawPawnCore(ctx, gx, gy, dir, {
    ...look,
    hair,
    cap: look.cap ?? HAIR_RENDER[hair].capCfg,
    lash: { ...DEFAULT_LASH, ...look.lash },
  }, g);
}

/** 等距地磚：菱形棋盤 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number,
  fill: string,
  showGrid: boolean,
): void {
  ctx.beginPath();
  ctx.moveTo(gx, gy - TILE_H / 2);
  ctx.lineTo(gx + TILE_W / 2, gy);
  ctx.lineTo(gx, gy + TILE_H / 2);
  ctx.lineTo(gx - TILE_W / 2, gy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (showGrid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }
}

/** 現況：`Graphics.circle()`，圓心自地磚中心上移一個半徑 */
export function drawCircle(ctx: CanvasRenderingContext2D, gx: number, gy: number): void {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(gx, gy - CIRCLE_RADIUS, CIRCLE_RADIUS + 2, CIRCLE_RADIUS + 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#74c0fc';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.ellipse(gx, gy - CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#4dabf7';
  ctx.fill();
  ctx.restore();
}

export interface DemoPreset {
  id: string;
  label: string;
  hair: HairStyleId;
  eyes: 'dots' | 'none';
  skin: string;
  hairColor: string;
  cloth: string;
  eyeColor?: string;
  lash?: Partial<typeof DEFAULT_LASH>;
}

/**
 * 造型預設 —— 五職業（`04-character.md`）＋ 幾個城鎮設施 NPC。
 * 這是**調校用的起點**，不是規格；定案的值之後進 `models/` 或 NPC 設定。
 */
export const PRESETS: DemoPreset[] = [
  { id: 'knight', label: '騎士', hair: 'buzz', eyes: 'dots', skin: '#e8b98a', hairColor: '#4a3728', cloth: '#7f93b5' },
  { id: 'elf', label: '精靈', hair: 'pony', eyes: 'dots', lash: { on: 1 }, skin: '#f0d6b0', hairColor: '#d9c87a', cloth: '#5f9e6a' },
  { id: 'elementalist', label: '元素師', hair: 'twin', eyes: 'dots', lash: { on: 1 }, skin: '#e3b585', hairColor: '#6b4fa0', cloth: '#8b6fc4' },
  { id: 'priest', label: '牧師', hair: 'part', eyes: 'dots', skin: '#eec9a0', hairColor: '#c9c2b4', cloth: '#e6e2d6' },
  { id: 'thief', label: '盜賊', hair: 'part', eyes: 'dots', skin: '#d9a879', hairColor: '#2f2a33', cloth: '#4a4356' },

  { id: 'blacksmith', label: 'NPC 鐵匠', hair: 'bald', eyes: 'dots', skin: '#c98f5e', hairColor: '#3a2a20', cloth: '#6b4a33' },
  { id: 'general-store', label: 'NPC 雜貨', hair: 'twin', eyes: 'dots', lash: { on: 1 }, skin: '#eec9a0', hairColor: '#8a6b4a', cloth: '#4ade80' },
  { id: 'sigil-master', label: 'NPC 印記', hair: 'bun', eyes: 'dots', skin: '#dcb894', hairColor: '#b0aec4', cloth: '#5a4d7a' },
];
