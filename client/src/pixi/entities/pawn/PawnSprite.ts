import { Container, Graphics, Sprite } from 'pixi.js';
import {
  getPawnTexture,
  PAWN_ANCHOR_X,
  PAWN_ANCHOR_Y,
  PAWN_TEX_W,
  PAWN_TEX_H,
  PAWN_BAKE_SCALE,
} from './pawnTexture';
import type { PawnLook } from './drawPawn';
import type { PawnDirectionId } from './geometry';
import { facingFromDelta } from './facing';

/**
 * 一個角色剪影：地面標記 + 貼圖。玩家與 NPC 共用。
 *
 * 地面標記是一顆扁橢圓，**顏色沿用原本圓點的敵我配色**
 * （`13-town.md` § 13.2.1：綠＝友方、藍＝玩家）——
 * 剪影本身只有髮色膚色，沒有敵我資訊，那個區分不能跟著圓點一起消失。
 */
export class PawnSprite {
  readonly container: Container;
  private readonly marker: Graphics;
  private readonly sprite: Sprite;
  private look: PawnLook;
  private facing: PawnDirectionId;
  private lastX: number | null = null;
  private lastY: number | null = null;
  /** 這一幀有出手的話，朝向要以攻擊目標為準（見 updateFacingFrom） */
  private attackFacing: PawnDirectionId | null = null;

  constructor(look: PawnLook, markerColor: number, facing: PawnDirectionId = 'front') {
    this.look = look;
    this.facing = facing;
    this.container = new Container();

    /* 等距 2:1，所以垂直半徑是水平的一半 */
    this.marker = new Graphics();
    this.marker.ellipse(0, 0, 9, 4.5).fill({ color: markerColor, alpha: 0.35 });

    this.sprite = new Sprite(getPawnTexture(look, facing));
    /* 貼圖裡的腳底錨點對齊容器原點 —— 容器原點就是所站地磚的中心 */
    this.sprite.anchor.set(PAWN_ANCHOR_X / PAWN_TEX_W, PAWN_ANCHOR_Y / PAWN_TEX_H);
    this.sprite.scale.set(1 / PAWN_BAKE_SCALE);

    this.container.addChild(this.marker, this.sprite);
  }

  /** 換造型（換裝改衣色、或外觀被編輯）。同造型不會重烘 */
  setLook(look: PawnLook): void {
    this.look = look;
    this.sprite.texture = getPawnTexture(look, this.facing);
  }

  setFacing(facing: PawnDirectionId): void {
    if (facing === this.facing) return;
    this.facing = facing;
    this.sprite.texture = getPawnTexture(this.look, facing);
  }

  /**
   * 出手時轉向目標。**攻擊方向與角色朝向必須一致** ——
   * 往左射箭卻面向右，看起來就是背對著射。
   *
   * 只記下來，等這一幀的 `updateFacingFrom()` 一起套用：
   * 主迴圈的順序是「移動 → 戰鬥 → 更新畫面」，在這裡直接轉的話，
   * 同一幀稍後的位移更新會立刻把它蓋回去。
   */
  faceToward(fromX: number, fromY: number, toX: number, toY: number): void {
    const facing = facingFromDelta(toX - fromX, toY - fromY);
    if (facing) this.attackFacing = facing;
  }

  /**
   * 依這次的位移更新朝向。位移太小就維持原朝向 ——
   * 原地抖動時亂轉頭比不轉還明顯。
   *
   * **有出手就以攻擊目標為準**，位移只在沒出手時決定朝向：
   * 邊走邊打時如果讓移動贏，射擊那一瞬間會朝著走的方向而不是目標。
   */
  updateFacingFrom(x: number, y: number): void {
    const moved = this.lastX !== null && this.lastY !== null
      ? facingFromDelta(x - this.lastX, y - this.lastY)
      : null;

    const next = this.attackFacing ?? moved;
    if (next) this.setFacing(next);

    this.attackFacing = null;
    this.lastX = x;
    this.lastY = y;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
