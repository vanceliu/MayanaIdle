/**
 * 掛在角色身上的武器 —— **平常不畫，只在出手的那一次演出中出現**
 * （規格見 `docs/design/48-vfx.md` § 48.6）。
 *
 * 雙持武器有兩個 sprite；非雙持的第二個永遠隱藏，不另外建一套類別。
 */
import { Container, Sprite } from 'pixi.js';
import {
  WEAPON_ART,
  weaponGrip,
  weaponPlaybackMs,
  weaponPose,
  weaponTotalT,
  weaponAxis,
  type WeaponAttack,
} from './weaponGeometry';
import {
  getWeaponTexture,
  WEAPON_ANCHOR_X, WEAPON_ANCHOR_Y,
  WEAPON_TEX_W, WEAPON_TEX_H,
  WEAPON_BAKE_SCALE,
} from './weaponTexture';

export class WeaponSprite {
  readonly container: Container;
  private readonly hands: Sprite[];
  private attack: WeaponAttack | null = null;
  /** 這次演出已經走了多久（ms） */
  private elapsed = 0;
  /** 這次演出的實際長度（ms）—— 攻速高時會被壓縮 */
  private playMs = 0;

  constructor() {
    this.container = new Container();
    this.hands = [0, 1].map(() => {
      const s = new Sprite();
      /* 貼圖裡的握點對齊 sprite 原點：旋轉與位移都以握點為準 */
      s.anchor.set(WEAPON_ANCHOR_X / WEAPON_TEX_W, WEAPON_ANCHOR_Y / WEAPON_TEX_H);
      s.scale.set(1 / WEAPON_BAKE_SCALE);
      s.visible = false;
      this.container.addChild(s);
      return s;
    });
  }

  /** 這次演出要畫在角色之下嗎（往上的三個方向，§ 48.6.3） */
  get behindPawn(): boolean {
    return this.attack ? weaponAxis(this.attack.aim).behind : false;
  }

  get playing(): boolean {
    return this.attack !== null;
  }

  /**
   * 起動一次演出。**同一次攻擊只呼叫一次**；重複呼叫會從頭重播，
   * 那正是連續攻擊該有的行為（上一次還沒收完就被新的一次接手）。
   */
  play(attack: WeaponAttack): void {
    this.attack = attack;
    this.elapsed = 0;
    this.playMs = weaponPlaybackMs(WEAPON_ART[attack.type].motion, attack.attackIntervalMs);
    this.apply();
  }

  /** 每幀推進。沒有在演出時是零成本 */
  update(deltaMs: number): void {
    if (!this.attack) return;
    this.elapsed += deltaMs;
    this.apply();
  }

  private apply(): void {
    const attack = this.attack;
    if (!attack) return;

    const art = WEAPON_ART[attack.type];
    const t = this.playMs > 0 ? this.elapsed / this.playMs : 0;

    if (t > weaponTotalT(art.motion)) {
      this.stop();
      return;
    }

    for (let hand = 0; hand < this.hands.length; hand++) {
      const sprite = this.hands[hand];
      if (hand >= art.hands) {
        sprite.visible = false;
        continue;
      }

      const h = hand as 0 | 1;
      const pose = weaponPose(art.motion, art.geom, t, h, attack.aim);
      sprite.visible = pose.visible && pose.alpha > 0;
      if (!sprite.visible) continue;

      const grip = weaponGrip(art.geom, attack.aim, h);
      sprite.texture = getWeaponTexture(attack.type, attack.material, pose.lead, pose.pull);
      sprite.x = grip.x + pose.offX;
      sprite.y = grip.y + pose.offY;
      sprite.rotation = (pose.angle * Math.PI) / 180;
      sprite.alpha = pose.alpha;
    }
  }

  /** 收招或角色離場時清乾淨 —— 留著會在下一次出手前閃一格舊姿勢 */
  stop(): void {
    this.attack = null;
    this.elapsed = 0;
    for (const s of this.hands) s.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
