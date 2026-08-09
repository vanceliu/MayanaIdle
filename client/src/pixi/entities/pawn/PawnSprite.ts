import { Container, Graphics, Sprite } from 'pixi.js';
import { WeaponSprite } from './WeaponSprite';
import type { WeaponAttack } from './weaponGeometry';
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
import { pawnFacingForAim } from './weaponGeometry';

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
  /** 受擊白閃用的加算副本 —— 貼圖與 `sprite` 同一張，換圖時要一起換 */
  private readonly flash: Sprite;
  /** 武器：平常不畫，只在出手的那一次演出中出現（`48-vfx.md` § 48.6） */
  private readonly weapon: WeaponSprite;
  private look: PawnLook;
  private facing: PawnDirectionId;
  private lastX: number | null = null;
  private lastY: number | null = null;
  /** 這一幀有出手的話，朝向要以攻擊目標為準（見 updateFacingFrom） */
  private attackFacing: PawnDirectionId | null = null;
  /**
   * 揮擊演出期間鎖住的朝向。
   *
   * `attackFacing` 只撐一幀，但演出有數百毫秒（十幾幀）——
   * 只靠它的話，邊走邊打時只有出手那一幀朝著目標，其餘幀被移動方向蓋回去，
   * 看起來就是「往左走、卻在右邊揮刀」。
   */
  private attackHold: PawnDirectionId | null = null;
  private weaponBehind = false;

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

    /*
     * 受擊白閃（`48-vfx.md` § 48.7.6）：同一張貼圖用**加算混色**再疊一層。
     * `tint` 只能變暗，做不出白閃；filter 是額外的 render pass（§ 48.2）。
     * 加算是繪製狀態，不是 pass。
     */
    this.flash = new Sprite(this.sprite.texture);
    this.flash.anchor.copyFrom(this.sprite.anchor);
    this.flash.scale.copyFrom(this.sprite.scale);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;

    this.weapon = new WeaponSprite();
    this.container.addChild(this.marker, this.sprite, this.flash, this.weapon.container);
  }

  /**
   * 出手：轉向目標並起動武器演出。
   *
   * 朝向與武器揮向來自**同一個** `aim`（`pawnFacingForAim()` 把連續角度
   * 收斂回四張角色圖），兩邊各自算的話會出現「角色面向右、武器往右下揮」。
   */
  attack(attack: WeaponAttack): void {
    this.attackHold = pawnFacingForAim(attack.aim);
    this.attackFacing = this.attackHold;
    this.weapon.play(attack);
    this.syncWeaponDepth();
  }

  /**
   * Debuff 染色（`48-vfx.md` § 48.8.2）。`null` ＝ 恢復原色。
   *
   * 只染剪影，**地面標記不染** —— 那顆標記帶的是敵我資訊（藍＝玩家），
   * 被中毒染綠就讀不出來了。
   */
  setTint(tint: number | null): void {
    this.sprite.tint = tint ?? 0xffffff;
  }

  /** 受擊白閃的強度（0–1）。0 ＝ 不疊 */
  setFlash(alpha: number): void {
    this.flash.alpha = alpha;
  }

  /** 每幀推進武器演出。沒有在演出時是零成本 */
  update(deltaMs: number): void {
    const wasBehind = this.weaponBehind;
    this.weapon.update(deltaMs);
    if (this.weapon.behindPawn !== wasBehind) this.syncWeaponDepth();
    /* 演出結束才把朝向還給移動 */
    if (!this.weapon.playing) this.attackHold = null;
  }

  /**
   * 往螢幕上方的三個方向，目標格在更遠處 —— 武器在深度上就在角色後面，
   * 畫在上層會整支蓋過頭（`48-vfx.md` § 48.6.3）。
   */
  private syncWeaponDepth(): void {
    this.weaponBehind = this.weapon.behindPawn;
    const idx = this.container.getChildIndex(this.weapon.container);
    const want = this.weaponBehind ? 1 : 2; /* 0 = 地面標記 */
    if (idx !== want) this.container.setChildIndex(this.weapon.container, want);
  }

  /** 換造型（換裝改衣色、或外觀被編輯）。同造型不會重烘 */
  setLook(look: PawnLook): void {
    this.look = look;
    this.setTexture(getPawnTexture(look, this.facing));
  }

  /**
   * 換貼圖。**一律走這裡** —— 白閃那層是同一張圖的副本，
   * 直接寫 `sprite.texture` 會讓閃光留在上一個朝向的剪影上。
   */
  private setTexture(texture: Sprite['texture']): void {
    this.sprite.texture = texture;
    this.flash.texture = texture;
  }

  /** 目前朝哪 —— 測試用來確認出手時朝向有沒有被移動方向蓋掉 */
  get currentFacing(): PawnDirectionId {
    return this.facing;
  }

  setFacing(facing: PawnDirectionId): void {
    if (facing === this.facing) return;
    this.facing = facing;
    this.setTexture(getPawnTexture(this.look, facing));
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
   *
   * 而且要撐**整段演出**（`attackHold`），不是只有出手那一幀 ——
   * 只撐一幀的話，往左走時只有第一幀面向右邊的怪，之後就轉回去了。
   */
  updateFacingFrom(x: number, y: number): void {
    const moved = this.lastX !== null && this.lastY !== null
      ? facingFromDelta(x - this.lastX, y - this.lastY)
      : null;

    /* 出手那一幀 > 演出期間鎖住的 > 移動方向 */
    const next = this.attackFacing ?? this.attackHold ?? moved;
    if (next) this.setFacing(next);

    this.attackFacing = null;
    this.lastX = x;
    this.lastY = y;
  }

  destroy(): void {
    this.weapon.stop();
    this.container.destroy({ children: true });
  }
}
