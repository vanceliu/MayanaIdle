/**
 * 怪物 img2img 底圖共用的繪圖形狀（`wyvernBase.ts`、`twinDragonBase.ts`）。
 *
 * 畫布、視圖中心與地面同 `pawnBase.ts`；座標為畫布像素。
 */
import { paint, type PawnContext } from '../pawn/drawPawn';
import { OUTLINE_COLOR } from '../pawn/geometry';
import { PAWN_BASE_GROUND_Y, PAWN_BASE_VIEWS } from './pawnBase';

/** 龍類底圖的配色 */
export interface DragonBaseColors {
  body: string;
  belly: string;
  wing: string;
  horn: string;
}

export const BASE_OUTLINE = 7;
export const BASE_DETAIL_OUTLINE = 4;
export const [BASE_FRONT_X, BASE_SIDE_X, BASE_BACK_X] = PAWN_BASE_VIEWS.map(v => v.x);
/** 身體底緣離地面的距離 */
const FOOT_GAP = 10;
/** 身體底緣的 y */
export const BASE_BODY_BOTTOM = PAWN_BASE_GROUND_Y - FOOT_GAP;

export type Point = readonly [number, number];

export function ellipse(ctx: PawnContext, cx: number, cy: number, rx: number, ry: number, fill: string, outline = BASE_OUTLINE): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  paint(ctx, fill, outline);
}

/** 折線＋二次曲線的封閉形狀：點為 [x, y]，曲線段為 [控制點, 終點] */
export function shape(ctx: PawnContext, start: Point, segments: readonly (Point | readonly [Point, Point])[], fill: string, outline = BASE_OUTLINE): void {
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (const seg of segments) {
    if (typeof seg[0] === 'number') ctx.lineTo(seg[0], (seg as Point)[1]);
    else {
      const [c, p] = seg as readonly [Point, Point];
      ctx.quadraticCurveTo(c[0], c[1], p[0], p[1]);
    }
  }
  ctx.closePath();
  paint(ctx, fill, outline);
}

export function dot(ctx: PawnContext, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  paint(ctx, OUTLINE_COLOR, 0);
}
