/**
 * 人形怪物的 img2img 底圖：角色剪影（`drawPawn`）的正面／側面（朝右）／背面三視圖（`25-monster-system.md` § 25.2.2）。
 *
 * 畫布尺寸同 AI 原圖（`MONSTER_RAW`），呼叫端先塗 `PAWN_BASE_BACKGROUND` 再呼叫 `drawPawnBase`。
 */
import { DEFAULT_LASH, type HairStyleId } from '../../../models/appearance';
import { drawPawn, type PawnContext, type PawnLook } from '../pawn/drawPawn';
import { OUTLINE_COLOR, PAWN_DIRECTION_BY_ID, PAWN_GEOM, type PawnDirectionId } from '../pawn/geometry';
import { resolveCapCfg } from '../pawn/hairRender';

export const PAWN_BASE_SIZE = { width: 1536, height: 640 };
export const PAWN_BASE_BACKGROUND = '#FF00FF';
/** 角色剪影放大倍率（`PawnGeom.scale`，百分比） */
export const PAWN_BASE_SCALE = 1200;
/** 描邊粗細（`PawnGeom.outline`，0.1 px，放大前） */
export const PAWN_BASE_OUTLINE = 6;
/** 軀幹底部的 y */
export const PAWN_BASE_GROUND_Y = 600;
/** 由左到右三個視圖的朝向與中心 x */
export const PAWN_BASE_VIEWS: readonly { direction: PawnDirectionId; x: number }[] = [
  { direction: 'front', x: 256 },
  { direction: 'right', x: 768 },
  { direction: 'back', x: 1280 },
];

export interface PawnBaseColors {
  skin: string;
  cloth: string;
  /** 預設禿頭；髮型可當兜帽等頭部輪廓用 */
  hair?: HairStyleId;
  hairColor?: string;
}

/** 無睫毛的剪影外觀 */
export function pawnBaseLook({ skin, cloth, hair = 'bald', hairColor = skin }: PawnBaseColors): PawnLook {
  return {
    hair,
    skin,
    hairColor,
    eyeColor: OUTLINE_COLOR,
    cloth,
    eyes: 'dots',
    lash: { ...DEFAULT_LASH, on: 0 },
    cap: resolveCapCfg(hair, undefined),
  };
}

/** 畫三視圖剪影（無地面陰影） */
export function drawPawnBase(ctx: PawnContext, colors: PawnBaseColors): void {
  const look = pawnBaseLook(colors);
  const geom = { ...PAWN_GEOM, scale: PAWN_BASE_SCALE, outline: PAWN_BASE_OUTLINE, shadow: 0 };
  for (const { direction, x } of PAWN_BASE_VIEWS) drawPawn(ctx, x, PAWN_BASE_GROUND_Y, PAWN_DIRECTION_BY_ID[direction], look, geom);
}
