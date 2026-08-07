export {
  OUTLINE_COLOR,
  EYE_COLOR_DEFAULT,
  PAWN_GEOM,
  PAWN_DIRECTIONS,
  PAWN_DIRECTION_BY_ID,
  type PawnGeom,
  type PawnDirection,
  type PawnDirectionId,
} from './geometry';

export {
  HAIR_RENDER,
  resolveCapCfg,
  type CapCfg,
  type TailCfg,
  type HairRender,
} from './hairRender';

export { drawPawn, type PawnContext, type PawnLook } from './drawPawn';

export { facingFromDelta } from './facing';
export { PawnSprite } from './PawnSprite';

export {
  getPawnTexture,
  toPawnLook,
  pawnLookKey,
  clearPawnTextureCache,
  pawnTextureCacheSize,
  PAWN_TEX_W,
  PAWN_TEX_H,
  PAWN_ANCHOR_X,
  PAWN_ANCHOR_Y,
  PAWN_BAKE_SCALE,
} from './pawnTexture';
