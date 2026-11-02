import { Graphics, Container } from 'pixi.js';
import { worldToScreen, getEntityDepth, TILE_H, TILE_W } from '../utils/isometric';
import type { Position } from '../../models/mapControl';
import type { MonsterSize } from '../../models/monster';
import { CastBar } from '../ui/CastBar';
import { HealthBar } from '../ui/HealthBar';
import { HIT_REACTION_ART } from '../ui/skillFx';
import { HitReaction } from './hitReaction';
import { BACKGROUND_RENDER_GENERATION, GEN2_STYLE, outlineInPlace, type Gen2Style } from '../backgroundRender';

const MONSTER_COLOR = 0xff6b6b;
const BOSS_COLOR = 0xcc00cc;
const GLOW_COLOR = 0xff8888;
const BOSS_GLOW_COLOR = 0xff00ff;
/** 球半徑依體型（`25-monster-system.md` § 25.2.1） */
export const MONSTER_RADIUS: Record<MonsterSize, number> = {
  small: TILE_H * 0.45,
  large: TILE_H * 0.75,
};

/** 球頂比小型高出多少 px。頭上的角、血條、詠唱條一起上移這麼多 */
export function monsterTopLift(size: MonsterSize): number {
  return 2 * (MONSTER_RADIUS[size] - MONSTER_RADIUS.small);
}

/** 球心比小型高出多少 px。命中點、懸停判定跟著球心走 */
export function monsterCenterLift(size: MonsterSize): number {
  return MONSTER_RADIUS[size] - MONSTER_RADIUS.small;
}
/** 目標環用暖白：怪物是紅、Boss 是紫，兩者都不會與它混淆 */
const TARGET_RING_COLOR = 0xffe9a8;

export class MonsterEntity {
  public container: Container;
  public id: string;
  private glow: Graphics;
  private body: Graphics;
  /** 當前目標的地面環（`03-combat.md` § 3.6.1） */
  private targetRing: Graphics;
  private flash: Graphics;
  /** 頭上的角、血條、詠唱條；整組跟著球頂上移 */
  private overhead: Container;
  private horns: Graphics | null = null;
  private healthBar: HealthBar;
  private castBar: CastBar;
  /** 被打到時往後彈（§ 48.7.6）。位置每幀重設，所以偏移疊在 `updatePosition()` 裡 */
  private readonly hitReaction = new HitReaction();
  /** 沒有受擊偏移時該站的螢幕座標。淡出期間沒有 `updatePosition()` 可依靠 */
  private baseX = 0;
  private baseY = 0;
  /** 還有幾發特效正在飛向這隻怪。>0 就還不能開始淡出 */
  private pendingHits = 0;
  /** 還在空中的那幾發已經扣掉、但畫面上還不該扣的血量 */
  private pendingDamage = 0;
  /** 判死之後等了多久（ms），用來觸發保險絲 */
  private graceMs = 0;
  private readonly isBoss: boolean;
  private size: MonsterSize;

  /** `outline`：球體、Boss 角、血條的外框樣式；`null` 不畫（第一代背景 render） */
  constructor(
    id: string,
    isBoss = false,
    size: MonsterSize = 'small',
    outline: Readonly<Gen2Style> | null = BACKGROUND_RENDER_GENERATION === 2 ? GEN2_STYLE : null,
  ) {
    this.id = id;
    this.isBoss = isBoss;
    this.size = size;
    this.container = new Container();

    /*
     * 目標環畫在**腳下**而不是球體上：球體本身已經用顏色區分 Boss 與一般怪，
     * 再疊一層外框會與 Boss 的紫色糊在一起。地面環是等角投影，
     * 所以是壓扁的橢圓（TILE_H / TILE_W = 1/2），畫成正圓會浮在半空中。
     */
    this.targetRing = new Graphics();
    this.targetRing.visible = false;
    this.glow = new Graphics();
    this.body = new Graphics();

    /*
     * 受擊白閃（§ 48.7.6）：同一顆球的白色副本，用**加算混色**疊上去。
     * `tint` 只能變暗，做不出白閃；filter 每一個都是額外的 render pass
     * 而怪物有一整群（§ 48.2）。加算是繪製狀態，不是 pass。
     */
    this.flash = new Graphics();
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;

    // 環在最底層，球體壓在它上面才有「站在圈裡」的感覺
    this.container.addChild(this.targetRing);
    this.container.addChild(this.glow);
    this.container.addChild(this.body);
    this.container.addChild(this.flash);

    this.overhead = new Container();
    if (isBoss) {
      this.horns = new Graphics();
      this.overhead.addChild(this.horns);
    }
    this.healthBar = new HealthBar(isBoss);
    this.overhead.addChild(this.healthBar.container);
    this.castBar = new CastBar();
    this.overhead.addChild(this.castBar.container);
    this.container.addChild(this.overhead);

    this.drawBody();
    if (outline) {
      outlineInPlace(this.body, outline.objectOutlineWidth, outline.outlineColor);
      if (this.horns) outlineInPlace(this.horns, outline.objectOutlineWidth, outline.outlineColor);
      this.healthBar.addOutline(outline.hpBarOutlineWidth, outline.outlineColor);
    }
  }

  /** 依體型重畫球、光暈、白閃、目標環與角，並把頭上元件移到球頂 */
  private drawBody(): void {
    const r = MONSTER_RADIUS[this.size];
    const ringScale = r / MONSTER_RADIUS.small;
    const glowColor = this.isBoss ? BOSS_GLOW_COLOR : GLOW_COLOR;
    const bodyColor = this.isBoss ? BOSS_COLOR : MONSTER_COLOR;

    this.targetRing.clear()
      .ellipse(0, 0, TILE_W * 0.34 * ringScale, TILE_H * 0.34 * ringScale)
      .stroke({ color: TARGET_RING_COLOR, width: 2, alpha: 0.95 });
    this.glow.clear().circle(0, -r, r + 2).fill({ color: glowColor, alpha: 0.3 });
    this.body.clear().circle(0, -r, r).fill({ color: bodyColor });
    this.flash.clear().circle(0, -r, r).fill({ color: 0xffffff });

    /* 角畫在小型球頂，整組靠 `overhead.y` 上移 */
    const top = -MONSTER_RADIUS.small * 2;
    this.horns?.clear()
      .poly([-6, top, -3, top - 8, 0, top])
      .fill({ color: BOSS_COLOR })
      .poly([0, top, 3, top - 8, 6, top])
      .fill({ color: BOSS_COLOR });
    this.overhead.y = -monsterTopLift(this.size);
  }

  /** 體型。實體可能比怪物實例先建出來，拿到實例後才補上 */
  setSize(size: MonsterSize): void {
    if (size === this.size) return;
    this.size = size;
    this.drawBody();
  }

  get monsterSize(): MonsterSize {
    return this.size;
  }

  /** 球半徑（px） */
  get radius(): number {
    return MONSTER_RADIUS[this.size];
  }

  /**
   * 被打到（§ 48.7.6）。方向是**從攻擊者指向自己**，被打飛才是那個方向。
   * 深度不跟著抖 —— 只是被推一下，不是換了一格。
   */
  hit(dirX: number, dirY: number): void {
    this.hitReaction.hit(dirX, dirY);
  }

  /**
   * 每幀推進受擊反應，並把偏移疊回基準位置。
   *
   * **偏移在這裡套，不在 `updatePosition()`** —— 死掉的怪已經從 store 拿掉，
   * 不會再收到 `updatePosition()`，淡出期間的下沉就沒人套了。
   */
  update(deltaMs: number): void {
    this.hitReaction.update(deltaMs);
    this.flash.alpha = this.hitReaction.flashAlpha;
    this.container.alpha = this.hitReaction.alpha;
    this.container.x = this.baseX + this.hitReaction.offsetX;
    this.container.y = this.baseY + this.hitReaction.offsetY;
  }

  /**
   * 有一發特效正在飛向這隻怪。
   *
   * **判定與演出是兩條時間線** —— 怪在判定的那一刻就從 store 消失，
   * 但打死牠的那一發可能還在空中。沒有這個保留，屍體會在投射物落地前
   * 就淡光並被銷毀，`onLand` 那一刻連實體都找不到，白閃與抖動一次都不會發生。
   */
  reserveHit(damage = 0): void {
    this.pendingHits++;
    this.pendingDamage += damage;
  }

  /** 那一發落地了 */
  releaseHit(damage = 0): void {
    this.pendingHits = Math.max(0, this.pendingHits - 1);
    this.pendingDamage = Math.max(0, this.pendingDamage - damage);
  }

  /**
   * store 已經把牠拿掉了 —— 該不該現在開始淡。
   *
   * 還有特效在飛就再等一幀；等超過保險絲就不等了
   * （特效被池子擠掉時 `onLand` 不會觸發，不設上限屍體會永遠留著）。
   */
  retire(deltaMs: number): void {
    if (this.pendingHits > 0 && this.graceMs < HIT_REACTION_ART.corpseGraceMs) {
      this.graceMs += deltaMs;
      return;
    }
    this.die();
  }

  /**
   * 死了 —— 淡出並下沉（§ 48.7.6）。期間不可再被選為目標。
   *
   * **血條要先歸零再淡。** 判定那一刻怪就從 store 拿掉了，
   * 之後不會再收到 `updateHp()`，血條會停在死前那一格 ——
   * 一擊必殺就變成「滿血的怪憑空消失」，看不出牠是被打死的。
   */
  die(): void {
    this.hitReaction.die();
    this.healthBar.update(0, 1);
    this.castBar.update(0);
  }

  /** 淡出演完了沒。呼叫端靠它決定何時把實體拿掉 */
  get faded(): boolean {
    return this.hitReaction.faded;
  }

  /** 這一幀白閃疊了多亮（0–1）。測試用來確認秒殺時那一下有演到 */
  get flashAlpha(): number {
    return this.flash.alpha;
  }

  /** 血條這一刻畫出來的比例（0–1） */
  get hpRatio(): number {
    return this.healthBar.ratio;
  }

  /**
   * 回到全新的狀態（沒被打過、沒死）。
   *
   * **只有調校頁重播用得到** —— 遊戲裡死了就是拿掉，不會復活。
   */
  revive(): void {
    this.pendingHits = 0;
    this.graceMs = 0;
    this.hitReaction.reset();
    this.flash.alpha = 0;
    this.container.alpha = 1;
    this.healthBar.update(1, 1);
  }

  updatePosition(pos: Position, elevation = 0): void {
    const { sx, sy } = worldToScreen(pos.x, pos.y, elevation);
    this.baseX = sx;
    this.baseY = sy;
    this.container.x = sx + this.hitReaction.offsetX;
    this.container.y = sy + this.hitReaction.offsetY;
    this.container.zIndex = getEntityDepth(pos, elevation);
  }

  /** 詠唱進度 0~1，0 ＝ 沒在詠唱（`systems/monsterCombatFSM.ts` 的 `castProgress`） */
  updateCast(progress: number): void {
    this.castBar.update(progress);
  }

  /**
   * 血條跟著**演出**走，不跟著判定：還在空中的那幾發先加回去，
   * 落地扣掉 `pendingDamage` 時血條才下降 —— 否則箭一射出去血就先扣完了。
   */
  updateHp(current: number, max: number): void {
    this.healthBar.update(Math.min(current + this.pendingDamage, max), max);
  }

  /** 這隻是不是玩家目前的目標（§ 3.6.1）。每幀對帳，不需要另外清除 */
  setTargeted(targeted: boolean): void {
    this.targetRing.visible = targeted;
  }

  /**
   * Debuff 染色（§ 48.8.2）。`null` ＝ 恢復原色。
   *
   * 只染身體與光暈，**血條不染** —— 血條是讀數，被染色會讓人以為血量有問題。
   */
  setTint(tint: number | null): void {
    const value = tint ?? 0xffffff;
    this.body.tint = value;
    this.glow.tint = value;
  }

  destroy(): void {
    this.healthBar.destroy();
    this.castBar.destroy();
    this.container.destroy({ children: true });
  }
}
