/**
 * 被打到的那一下，實體自己要做的反應（`48-vfx.md` § 48.7.6）。
 *
 * 爆點畫在特效層，**位移必須由實體自己做** —— 特效層動不了角色。
 * 玩家與怪物共用這一份：兩邊各寫一次，數字必然分岔。
 *
 * 位移是**每幀重算後疊在基準位置上**，不是累加 ——
 * 累加的話連續被打會把實體推走，而且推的量取決於掉幀。
 */
import {
  HIT_REACTION_ART, SKILL_FX_ART, deathFadeState, hitFlashAlpha, hitShakeOffset,
} from '../ui/skillFx';

export class HitReaction {
  /** 走到第幾毫秒。超過長度就是沒在演 */
  private elapsed = Infinity;
  private dirX = 0;
  private dirY = 0;
  /** 白閃走到第幾毫秒。與位移分開計時 —— 閃比彈短（§ 48.7.6） */
  private flashElapsed = Infinity;
  /** 死亡淡出走到第幾毫秒。`null` ＝ 還活著 */
  private deathElapsed: number | null = null;

  /**
   * 被打到。`dirX/dirY` 是**從攻擊者指向自己**的單位向量 ——
   * 被打飛才是那個方向，反過來會變成朝著攻擊者衝過去。
   */
  hit(dirX: number, dirY: number): void {
    const len = Math.hypot(dirX, dirY);
    /* 攻擊者與自己重疊（距離 0）時沒有方向可言，就不彈 */
    if (len === 0) return;
    this.dirX = dirX / len;
    this.dirY = dirY / len;
    this.elapsed = 0;
    this.flashElapsed = 0;
  }

  /** 死了。淡出一次就不再重來 —— 重複呼叫不會把它拉回全不透明 */
  die(): void {
    this.deathElapsed ??= 0;
  }

  /** 回到全新的狀態。遊戲裡用不到（死了就是拿掉），調校頁重播要 */
  reset(): void {
    this.elapsed = Infinity;
    this.flashElapsed = Infinity;
    this.deathElapsed = null;
  }

  /** 淡出演完了沒。呼叫端靠它決定何時把實體從畫面上拿掉 */
  get faded(): boolean {
    return this.deathElapsed !== null && this.deathElapsed >= HIT_REACTION_ART.deathFadeMs;
  }

  update(deltaMs: number): void {
    if (this.deathElapsed !== null) this.deathElapsed += deltaMs;

    if (this.flashElapsed !== Infinity) {
      this.flashElapsed += deltaMs;
      if (this.flashElapsed >= HIT_REACTION_ART.flashMs) this.flashElapsed = Infinity;
    }

    if (this.elapsed === Infinity) return;
    this.elapsed += deltaMs;
    if (this.elapsed >= SKILL_FX_ART.impact.hitShakeMs) this.elapsed = Infinity;
  }

  /** 這一幀白閃要疊多亮（0–1）。0 ＝ 不疊 */
  get flashAlpha(): number {
    if (this.flashElapsed === Infinity) return 0;
    return hitFlashAlpha(this.flashElapsed, HIT_REACTION_ART);
  }

  /** 這一幀的透明度。還活著時是 1 */
  get alpha(): number {
    if (this.deathElapsed === null) return 1;
    return deathFadeState(this.deathElapsed, HIT_REACTION_ART).alpha;
  }

  /** 這一幀要疊多少（螢幕座標）。沒在演時是 0，不必特別判斷 */
  get offsetX(): number {
    return this.dirX * this.amount;
  }

  get offsetY(): number {
    return this.dirY * this.amount + this.sinkPx;
  }

  private get amount(): number {
    if (this.elapsed === Infinity) return 0;
    return hitShakeOffset(this.elapsed, SKILL_FX_ART.impact);
  }

  /** 死亡下沉。與受擊位移相加 —— 兩者可能同時發生（最後一下打死） */
  private get sinkPx(): number {
    if (this.deathElapsed === null) return 0;
    return deathFadeState(this.deathElapsed, HIT_REACTION_ART).sinkPx;
  }
}
