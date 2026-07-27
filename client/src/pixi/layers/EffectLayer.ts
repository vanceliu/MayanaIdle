import { Container } from 'pixi.js';
import { DamageNumberManager } from '../ui/DamageNumber';
import { ProjectileManager, type ProjectileSpawnOpts } from '../ui/Projectile';
import type { DamageType } from '../ui/CombatVisualEvent';

export class EffectLayer {
  public container: Container;
  public damageNumbers: DamageNumberManager;
  public projectiles: ProjectileManager;

  constructor() {
    this.container = new Container();
    this.damageNumbers = new DamageNumberManager();
    this.projectiles = new ProjectileManager();
    this.container.addChild(this.projectiles.container);
    this.container.addChild(this.damageNumbers.container);
  }

  spawnDamageNumber(screenX: number, screenY: number, value: number, damageType: DamageType): void {
    this.damageNumbers.spawn(screenX, screenY, value, damageType);
  }

  spawnProjectile(opts: ProjectileSpawnOpts): void {
    this.projectiles.spawn(opts);
  }

  update(deltaMS: number): void {
    this.damageNumbers.update(deltaMS);
    this.projectiles.update(deltaMS);
  }

  clear(): void {
    this.damageNumbers.clear();
    this.projectiles.clear();
    this.container.removeChildren();
    this.container.addChild(this.projectiles.container);
    this.container.addChild(this.damageNumbers.container);
  }

  destroy(): void {
    this.damageNumbers.destroy();
    this.projectiles.destroy();
    this.container.removeChildren();
  }
}
