/**
 * Wyvern 的 img2img 底圖：雙足、翅膀為唯一前肢且收在身體兩側、無手、不露腳的
 * 正面／側面（朝右）／背面剪影（`25-monster-system.md` § 25.2.2）。
 *
 * 畫布、視圖中心與地面同 `pawnBase.ts`；座標為畫布像素。
 */
import type { PawnContext } from '../pawn/drawPawn';
import {
  BASE_BACK_X as BACK_X,
  BASE_BODY_BOTTOM as G,
  BASE_DETAIL_OUTLINE as DETAIL_OUTLINE,
  BASE_FRONT_X as FRONT_X,
  BASE_SIDE_X as SIDE_X,
  dot,
  ellipse,
  shape,
  type DragonBaseColors,
} from './baseShapes';

export type WyvernBaseColors = DragonBaseColors;

/** 三視圖共用的頭中心高度，三面總高相近 */
const HEAD_Y = G - 385;
/** 三視圖共用的身體高度（橢圓垂直半徑），頭身比一致 */
const BODY_RY = 108;

/** 收起的翅膀（正面／背面），s＝±1 為左右；肩在 (cx + s × shoulder, shoulderY) */
function foldedWing(ctx: PawnContext, cx: number, s: number, shoulder: number, c: WyvernBaseColors): void {
  const x = (dx: number) => cx + s * dx;
  shape(ctx, [x(shoulder), G - 230], [
    [x(125), G - 385],
    [x(155), G - 300],
    [x(165), G - 55],
    [[x(148), G - 95], [x(128), G - 50]],
    [[x(110), G - 90], [x(88), G - 55]],
    [x(shoulder), G - 120],
  ], c.wing);
  shape(ctx, [x(125), G - 385], [[x(118), G - 412], [x(138), G - 388]], c.horn, DETAIL_OUTLINE);
}

function horns(ctx: PawnContext, cx: number, c: WyvernBaseColors): void {
  for (const s of [-1, 1]) shape(ctx, [cx + s * 26, HEAD_Y - 46], [[cx + s * 56, HEAD_Y - 100], [cx + s * 52, HEAD_Y - 50]], c.horn, DETAIL_OUTLINE);
}

/** 正面／背面的脖子：由身體頂端往上收窄到頭 */
function neck(ctx: PawnContext, cx: number, c: WyvernBaseColors): void {
  shape(ctx, [cx - 52, G - 190], [
    [[cx - 34, G - 310], [cx - 36, HEAD_Y + 20]],
    [cx + 36, HEAD_Y + 20],
    [[cx + 34, G - 310], [cx + 52, G - 190]],
  ], c.body);
}

function drawFront(ctx: PawnContext, c: WyvernBaseColors): void {
  const cx = FRONT_X;
  shape(ctx, [cx + 40, G - 45], [
    [[cx + 100, G + 5], [cx + 140, G - 25]],
    [cx + 162, G - 42], [cx + 156, G - 6], [cx + 132, G - 8],
    [[cx + 90, G + 15], [cx + 30, G - 15]],
  ], c.body);
  for (const s of [-1, 1]) foldedWing(ctx, cx, s, 60, c);
  neck(ctx, cx, c);
  shape(ctx, [cx - 20, G - 200], [[[cx - 16, G - 300], [cx - 18, HEAD_Y + 40]], [cx + 18, HEAD_Y + 40], [[cx + 16, G - 300], [cx + 20, G - 200]]], c.belly, DETAIL_OUTLINE);
  ellipse(ctx, cx, G - BODY_RY, 100, BODY_RY, c.body);
  ellipse(ctx, cx, G - 92, 58, 70, c.belly, DETAIL_OUTLINE);
  horns(ctx, cx, c);
  ellipse(ctx, cx, HEAD_Y, 72, 60, c.body);
  ellipse(ctx, cx, HEAD_Y + 27, 40, 24, c.belly, DETAIL_OUTLINE);
  dot(ctx, cx - 28, HEAD_Y - 8, 7, 9);
  dot(ctx, cx + 28, HEAD_Y - 8, 7, 9);
  dot(ctx, cx - 10, HEAD_Y + 24, 3, 3);
  dot(ctx, cx + 10, HEAD_Y + 24, 3, 3);
}

function drawSide(ctx: PawnContext, c: WyvernBaseColors): void {
  const cx = SIDE_X;
  shape(ctx, [cx - 90, G - 120], [
    [[cx - 160, G - 30], [cx - 235, G - 18]],
    [cx - 262, G - 34], [cx - 256, G - 2], [cx - 228, G - 4],
    [[cx - 140, G + 10], [cx - 60, G - 30]],
  ], c.body);
  ellipse(ctx, cx - 10, G - BODY_RY, 130, BODY_RY, c.body);
  ellipse(ctx, cx + 35, G - 72, 66, 42, c.belly, DETAIL_OUTLINE);
  shape(ctx, [cx + 40, G - 170], [
    [[cx + 90, G - 250], [cx + 95, HEAD_Y + 20]],
    [cx + 160, HEAD_Y + 20],
    [[cx + 155, G - 210], [cx + 110, G - 120]],
  ], c.body);
  shape(ctx, [cx + 105, HEAD_Y - 25], [[[cx + 70, HEAD_Y - 65], [cx + 40, HEAD_Y - 75]], [[cx + 80, HEAD_Y - 40], [cx + 95, HEAD_Y - 5]]], c.horn, DETAIL_OUTLINE);
  ellipse(ctx, cx + 130, HEAD_Y, 62, 45, c.body);
  ellipse(ctx, cx + 178, HEAD_Y + 12, 34, 24, c.body);
  dot(ctx, cx + 140, HEAD_Y - 8, 7, 9);
  shape(ctx, [cx + 50, G - 180], [
    [cx + 10, G - 290],
    [cx - 30, G - 270],
    [cx - 170, G - 120],
    [[cx - 120, G - 120], [cx - 100, G - 90]],
    [[cx - 60, G - 110], [cx - 40, G - 75]],
    [[cx - 5, G - 100], [cx + 20, G - 75]],
    [cx + 50, G - 120],
  ], c.wing);
  shape(ctx, [cx + 10, G - 290], [[cx + 4, G - 316], [cx + 24, G - 292]], c.horn, DETAIL_OUTLINE);
}

function drawBack(ctx: PawnContext, c: WyvernBaseColors): void {
  const cx = BACK_X;
  neck(ctx, cx, c);
  ellipse(ctx, cx, G - BODY_RY, 100, BODY_RY, c.body);
  horns(ctx, cx, c);
  ellipse(ctx, cx, HEAD_Y, 72, 60, c.body);
  for (let y = HEAD_Y + 75; y <= G - 70; y += 44) shape(ctx, [cx - 12, y + 14], [[cx, y - 10], [cx + 12, y + 14]], c.wing, DETAIL_OUTLINE);
  for (const s of [-1, 1]) foldedWing(ctx, cx, s, 40, c);
  shape(ctx, [cx - 30, G - 60], [
    [[cx + 10, G + 10], [cx + 140, G - 18]],
    [cx + 168, G - 34], [cx + 160, G - 2], [cx + 132, G - 2],
    [[cx + 10, G + 30], [cx - 45, G - 30]],
  ], c.body);
}

/** 畫三視圖（呼叫端先塗背景） */
export function drawWyvernBase(ctx: PawnContext, colors: WyvernBaseColors): void {
  drawFront(ctx, colors);
  drawSide(ctx, colors);
  drawBack(ctx, colors);
}
