import { Text, TextStyle, Container } from 'pixi.js';
import { type DamageType, DAMAGE_COLORS } from './CombatVisualEvent';

const BASE_FONT_SIZE = 14;
const CRIT_FONT_SIZE = 20;
const FLOAT_DISTANCE = 40;
const DURATION_MS = 800;
const X_SPREAD = 15;

interface ActiveDamageNumber {
  text: Text;
  startX: number;
  startY: number;
  elapsed: number;
}

export class DamageNumberManager {
  private pool: Text[] = [];
  private active: ActiveDamageNumber[] = [];
  readonly container = new Container();

  spawn(screenX: number, screenY: number, value: number, damageType: DamageType): void {
    const text = this.acquire();
    const isCrit = damageType === 'crit';
    const isMiss = damageType === 'miss';

    const fontSize = isCrit ? CRIT_FONT_SIZE : BASE_FONT_SIZE;
    text.style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize,
      fontWeight: 'bold',
      fill: DAMAGE_COLORS[damageType],
      stroke: { color: 0x000000, width: isCrit ? 3 : 2 },
    });

    text.text = isMiss ? 'Miss' : `${damageType === 'heal' ? '+' : ''}${value}`;
    text.anchor.set(0.5, 1);

    const offsetX = (Math.random() - 0.5) * X_SPREAD * 2;
    text.x = screenX + offsetX;
    text.y = screenY;
    text.alpha = 1;
    text.visible = true;

    this.active.push({ text, startX: text.x, startY: screenY, elapsed: 0 });
  }

  update(deltaMS: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const entry = this.active[i];
      entry.elapsed += deltaMS;
      const t = Math.min(entry.elapsed / DURATION_MS, 1);

      entry.text.y = entry.startY - FLOAT_DISTANCE * t;
      entry.text.alpha = 1 - t;

      if (t >= 1) {
        this.release(entry.text);
        this.active.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const entry of this.active) {
      this.release(entry.text);
    }
    this.active.length = 0;
  }

  destroy(): void {
    this.clear();
    for (const t of this.pool) {
      t.destroy();
    }
    this.pool.length = 0;
    this.container.destroy({ children: true });
  }

  private acquire(): Text {
    const text = this.pool.pop() ?? new Text({ text: '' });
    if (!text.parent) {
      this.container.addChild(text);
    }
    return text;
  }

  private release(text: Text): void {
    text.visible = false;
    this.pool.push(text);
  }
}
