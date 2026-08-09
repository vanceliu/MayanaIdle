import { Container } from 'pixi.js';
import { DamageNumberManager, type DamageNumberStack } from '../ui/DamageNumber';
import { SkillFxManager } from '../ui/skillFx';
import type { DamageType } from '../ui/CombatVisualEvent';

export class EffectLayer {
  public container: Container;
  public damageNumbers: DamageNumberManager;
  /** 技能特效（`48-vfx.md` § 48.7）—— 起手、投射、命中、範圍爆都在這裡 */
  public skillFx: SkillFxManager;

  constructor() {
    this.container = new Container();
    this.damageNumbers = new DamageNumberManager();
    this.skillFx = new SkillFxManager();
    /* 特效在數字底下 —— 數字被爆點蓋住就等於沒跳 */
    this.container.addChild(this.skillFx.container);
    this.container.addChild(this.damageNumbers.container);
  }

  /** `stack` 見 `DamageNumberManager.spawn()`：多下判定時把數字攤開 */
  spawnDamageNumber(
    screenX: number,
    screenY: number,
    value: number,
    damageType: DamageType,
    stack?: DamageNumberStack,
  ): void {
    this.damageNumbers.spawn(screenX, screenY, value, damageType, stack);
  }

  update(deltaMS: number): void {
    this.damageNumbers.update(deltaMS);
    this.skillFx.update(deltaMS);
  }

  clear(): void {
    this.damageNumbers.clear();
    this.skillFx.clear();
    this.container.removeChildren();
    this.container.addChild(this.skillFx.container);
    this.container.addChild(this.damageNumbers.container);
  }

  destroy(): void {
    this.damageNumbers.destroy();
    this.skillFx.destroy();
    this.container.removeChildren();
  }
}
