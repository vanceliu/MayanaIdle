/**
 * 怪物 img2img 底圖的分派（`25-monster-system.md` § 25.2.2）：shape 省略＝角色剪影（`pawnBase.ts`），'wyvern'＝`wyvernBase.ts`，'twin-dragon'＝`twinDragonBase.ts`。
 */
import type { PawnContext } from '../pawn/drawPawn';
import { drawPawnBase, type PawnBaseColors } from './pawnBase';
import { drawTwinDragonBase, type TwinDragonBaseColors } from './twinDragonBase';
import { drawWyvernBase, type WyvernBaseColors } from './wyvernBase';

export type MonsterBase =
  | (PawnBaseColors & { shape?: 'pawn' })
  | (WyvernBaseColors & { shape: 'wyvern' })
  | (TwinDragonBaseColors & { shape: 'twin-dragon' });

export function drawMonsterBase(ctx: PawnContext, base: MonsterBase): void {
  if (base.shape === 'wyvern') drawWyvernBase(ctx, base);
  else if (base.shape === 'twin-dragon') drawTwinDragonBase(ctx, base);
  else drawPawnBase(ctx, base);
}
