import { Graphics, Container } from 'pixi.js';
import { worldToScreen, getEntityDepth, TILE_H } from '../utils/isometric';
import type { Position } from '../../models/mapControl';
import { HealthBar } from '../ui/HealthBar';
import { HitReaction } from './hitReaction';

const MONSTER_COLOR = 0xff6b6b;
const BOSS_COLOR = 0xcc00cc;
const GLOW_COLOR = 0xff8888;
const BOSS_GLOW_COLOR = 0xff00ff;
const RADIUS = TILE_H * 0.45;

export class MonsterEntity {
  public container: Container;
  public id: string;
  private glow: Graphics;
  private body: Graphics;
  private flash: Graphics;
  private healthBar: HealthBar;
  /** 被打到時往後彈（§ 48.7.6）。位置每幀重設，所以偏移疊在 `updatePosition()` 裡 */
  private readonly hitReaction = new HitReaction();
  /** 沒有受擊偏移時該站的螢幕座標。淡出期間沒有 `updatePosition()` 可依靠 */
  private baseX = 0;
  private baseY = 0;

  constructor(id: string, isBoss = false) {
    this.id = id;
    this.container = new Container();

    const glowColor = isBoss ? BOSS_GLOW_COLOR : GLOW_COLOR;
    const bodyColor = isBoss ? BOSS_COLOR : MONSTER_COLOR;

    this.glow = new Graphics();
    this.glow.circle(0, -RADIUS, RADIUS + 2).fill({ color: glowColor, alpha: 0.3 });

    this.body = new Graphics();
    this.body.circle(0, -RADIUS, RADIUS).fill({ color: bodyColor });

    /*
     * 受擊白閃（§ 48.7.6）：同一顆球的白色副本，用**加算混色**疊上去。
     * `tint` 只能變暗，做不出白閃；filter 每一個都是額外的 render pass
     * 而怪物有一整群（§ 48.2）。加算是繪製狀態，不是 pass。
     */
    this.flash = new Graphics();
    this.flash.circle(0, -RADIUS, RADIUS).fill({ color: 0xffffff });
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;

    this.container.addChild(this.glow);
    this.container.addChild(this.body);
    this.container.addChild(this.flash);

    if (isBoss) {
      this.drawBossHorns();
    }

    this.healthBar = new HealthBar(isBoss);
    this.container.addChild(this.healthBar.container);
  }

  private drawBossHorns(): void {
    const horns = new Graphics();
    horns
      .poly([-6, -RADIUS * 2, -3, -RADIUS * 2 - 8, 0, -RADIUS * 2])
      .fill({ color: BOSS_COLOR })
      .poly([0, -RADIUS * 2, 3, -RADIUS * 2 - 8, 6, -RADIUS * 2])
      .fill({ color: BOSS_COLOR });
    this.container.addChild(horns);
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
   * 死了 —— 淡出並下沉（§ 48.7.6）。期間不可再被選為目標。
   *
   * **血條要先歸零再淡。** 判定那一刻怪就從 store 拿掉了，
   * 之後不會再收到 `updateHp()`，血條會停在死前那一格 ——
   * 一擊必殺就變成「滿血的怪憑空消失」，看不出牠是被打死的。
   */
  die(): void {
    this.hitReaction.die();
    this.healthBar.update(0, 1);
  }

  /** 淡出演完了沒。呼叫端靠它決定何時把實體拿掉 */
  get faded(): boolean {
    return this.hitReaction.faded;
  }

  /**
   * 回到全新的狀態（沒被打過、沒死）。
   *
   * **只有調校頁重播用得到** —— 遊戲裡死了就是拿掉，不會復活。
   */
  revive(): void {
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

  updateHp(current: number, max: number): void {
    this.healthBar.update(current, max);
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
    this.container.destroy({ children: true });
  }
}
