/**
 * 雙頭龍的 img2img 底圖：坐姿、兩條脖子各接一顆有角的頭、翅膀收在背後、不露腳的
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

export type TwinDragonBaseColors = DragonBaseColors;

/** 身體橢圓的垂直半徑（三視圖共用）與正面／背面的水平半徑 */
const BODY_RY = 105;
const BODY_RX = 88;
/** 正面／背面兩顆頭的中心高度與左右間距 */
const HEAD_Y = G - 330;
const HEAD_DX = 88;

/** 收在背後的翅膀（正面／背面），s＝±1 為左右 */
function wing(ctx: PawnContext, cx: number, s: number, c: DragonBaseColors): void {
  const x = (dx: number) => cx + s * dx;
  shape(ctx, [x(70), G - 190], [
    [x(150), G - 300],
    [x(175), G - 250],
    [x(185), G - 80],
    [[x(165), G - 110], [x(145), G - 75]],
    [[x(125), G - 110], [x(100), G - 80]],
    [x(70), G - 110],
  ], c.wing);
}

/** 正面／背面的脖子：由身體頂端 (cx + s × 30) 往外上方接到頭 */
function neck(ctx: PawnContext, cx: number, s: number, c: DragonBaseColors): void {
  const x = (dx: number) => cx + s * dx;
  shape(ctx, [x(5), G - 200], [
    [[x(20), G - 270], [x(HEAD_DX - 30), HEAD_Y + 25]],
    [x(HEAD_DX + 30), HEAD_Y + 25],
    [[x(80), G - 250], [x(65), G - 190]],
  ], c.body);
}

function hornPair(ctx: PawnContext, hx: number, hy: number, c: DragonBaseColors): void {
  for (const s of [-1, 1]) shape(ctx, [hx + s * 18, hy - 32], [[hx + s * 44, hy - 95], [hx + s * 40, hy - 36]], c.horn, DETAIL_OUTLINE);
}

/** 正面的頭（臉朝前） */
function frontHead(ctx: PawnContext, hx: number, c: DragonBaseColors): void {
  hornPair(ctx, hx, HEAD_Y, c);
  ellipse(ctx, hx, HEAD_Y, 54, 46, c.body);
  ellipse(ctx, hx, HEAD_Y + 22, 32, 18, c.belly, DETAIL_OUTLINE);
  dot(ctx, hx - 22, HEAD_Y - 10, 6, 8);
  dot(ctx, hx + 22, HEAD_Y - 10, 6, 8);
}

/** 尾巴繞到身前（正面）／身後（背面），s＝±1 為尾尖方向 */
function tail(ctx: PawnContext, cx: number, s: number, c: DragonBaseColors): void {
  const x = (dx: number) => cx + s * dx;
  shape(ctx, [x(40), G - 40], [
    [[x(110), G + 5], [x(160), G - 25]],
    [x(182), G - 44], [x(176), G - 6], [x(150), G - 8],
    [[x(100), G + 18], [x(30), G - 12]],
  ], c.body);
}

function drawFront(ctx: PawnContext, c: DragonBaseColors): void {
  const cx = FRONT_X;
  for (const s of [-1, 1]) wing(ctx, cx, s, c);
  tail(ctx, cx, 1, c);
  for (const s of [-1, 1]) neck(ctx, cx, s, c);
  ellipse(ctx, cx, G - BODY_RY, BODY_RX, BODY_RY, c.body);
  ellipse(ctx, cx, G - 88, 52, 70, c.belly, DETAIL_OUTLINE);
  for (const s of [-1, 1]) frontHead(ctx, cx + s * HEAD_DX, c);
}

/** 側面的一條脖子加一顆朝右的頭；head 為頭中心 */
function sideNeckHead(ctx: PawnContext, cx: number, head: { x: number; y: number }, c: DragonBaseColors): void {
  shape(ctx, [cx + 40, G - 150], [
    [[head.x - 50, G - 210], [head.x - 35, head.y + 15]],
    [head.x + 20, head.y + 25],
    [[head.x + 10, G - 170], [cx + 110, G - 110]],
  ], c.body);
  shape(ctx, [head.x - 20, head.y - 28], [[[head.x - 55, head.y - 70], [head.x - 85, head.y - 78]], [[head.x - 45, head.y - 45], [head.x - 30, head.y - 10]]], c.horn, DETAIL_OUTLINE);
  ellipse(ctx, head.x, head.y, 50, 38, c.body);
  ellipse(ctx, head.x + 44, head.y + 10, 30, 21, c.body);
  dot(ctx, head.x + 10, head.y - 8, 6, 8);
}

function drawSide(ctx: PawnContext, c: DragonBaseColors): void {
  const cx = SIDE_X;
  shape(ctx, [cx - 100, G - 120], [
    [[cx - 170, G - 30], [cx - 245, G - 18]],
    [cx - 272, G - 34], [cx - 266, G - 2], [cx - 238, G - 4],
    [[cx - 150, G + 10], [cx - 70, G - 30]],
  ], c.body);
  sideNeckHead(ctx, cx, { x: cx + 50, y: HEAD_Y - 60 }, c);
  ellipse(ctx, cx - 20, G - BODY_RY, 140, BODY_RY, c.body);
  ellipse(ctx, cx + 45, G - 80, 70, 50, c.belly, DETAIL_OUTLINE);
  shape(ctx, [cx + 30, G - 200], [
    [cx - 10, G - 300],
    [cx - 50, G - 280],
    [cx - 170, G - 130],
    [[cx - 120, G - 130], [cx - 100, G - 100]],
    [[cx - 60, G - 120], [cx - 40, G - 85]],
    [[cx - 5, G - 110], [cx + 20, G - 85]],
    [cx + 40, G - 130],
  ], c.wing);
  sideNeckHead(ctx, cx, { x: cx + 175, y: HEAD_Y + 45 }, c);
}

/** 背面的頭（後腦勺） */
function backHead(ctx: PawnContext, hx: number, c: DragonBaseColors): void {
  hornPair(ctx, hx, HEAD_Y, c);
  ellipse(ctx, hx, HEAD_Y, 54, 46, c.body);
}

function drawBack(ctx: PawnContext, c: DragonBaseColors): void {
  const cx = BACK_X;
  for (const s of [-1, 1]) neck(ctx, cx, s, c);
  for (const s of [-1, 1]) backHead(ctx, cx + s * HEAD_DX, c);
  ellipse(ctx, cx, G - BODY_RY, BODY_RX, BODY_RY, c.body);
  for (let y = G - 200; y <= G - 60; y += 46) shape(ctx, [cx - 12, y + 14], [[cx, y - 10], [cx + 12, y + 14]], c.wing, DETAIL_OUTLINE);
  for (const s of [-1, 1]) wing(ctx, cx, s, c);
  tail(ctx, cx, -1, c);
}

/** 畫三視圖（呼叫端先塗背景） */
export function drawTwinDragonBase(ctx: PawnContext, colors: DragonBaseColors): void {
  drawFront(ctx, colors);
  drawSide(ctx, colors);
  drawBack(ctx, colors);
}
