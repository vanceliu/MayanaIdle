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
  /** 後蓋前用的識別（見 `spawn`）。沒有給的就不參與取代 */
  replaceKey?: string;
}

export class DamageNumberManager {
  private pool: Text[] = [];
  private active: ActiveDamageNumber[] = [];
  readonly container = new Container();

  /**
   * 跳一個傷害數字。
   *
   * `replaceKey`：**後蓋前**。多下判定（雙持雙擊、三連射）會在幾十毫秒內
   * 連跳好幾個數字，全部留著會三個一起飄、互相疊在一起讀不出來。
   * 帶同一個 key 的新數字會先把還在演的那個收掉，只留最新的一個。
   *
   * 不帶 key 的照舊全部並存 —— 不同怪的數字本來就該同時看得到。
   */
  /** 目前還在演的數字有幾個 —— 測試用來確認後蓋前有沒有生效 */
  get activeCount(): number {
    return this.active.length;
  }

  spawn(
    screenX: number,
    screenY: number,
    value: number,
    damageType: DamageType,
    replaceKey?: string,
  ): void {
    if (replaceKey !== undefined) this.retireKey(replaceKey);
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

    this.active.push({ text, startX: text.x, startY: screenY, elapsed: 0, replaceKey });
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

  /** 收掉還在演的同 key 數字 —— 後蓋前 */
  private retireKey(key: string): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].replaceKey !== key) continue;
      this.release(this.active[i].text);
      this.active.splice(i, 1);
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
