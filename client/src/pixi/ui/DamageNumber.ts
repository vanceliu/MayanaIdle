import { Text, TextStyle, Container } from 'pixi.js';
import { type DamageType, DAMAGE_COLORS } from './CombatVisualEvent';

const BASE_FONT_SIZE = 14;
const CRIT_FONT_SIZE = 20;
const FLOAT_DISTANCE = 40;
const DURATION_MS = 800;
const X_SPREAD = 15;
/** 連續多下時左右攤開的間距，必須大於字寬 */
const STACK_X_STEP = 26;
/** 連續多下時每一下再抬高一點，讓順序讀得出來 */
const STACK_Y_STEP = 10;

interface ActiveDamageNumber {
  text: Text;
  startX: number;
  startY: number;
  elapsed: number;
}

/**
 * 多下判定（雙持雙擊、三連射）在同一隻怪身上連跳好幾個數字時的排法。
 *
 * **每一下都要看得完整**，不是後面的蓋掉前面的 —— 那樣就等於少跳了幾下。
 * 但錯開的時間換不到足夠的距離（100ms 只有 5px，字高 14），
 * 所以要明確把它們攤開。
 */
export interface DamageNumberStack {
  /** 這是第幾下（0 起算） */
  index: number;
  /** 這次總共幾下 */
  count: number;
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
  /** 目前還在演的數字有幾個 —— 測試用來確認多下判定沒有互相取代 */
  get activeCount(): number {
    return this.active.length;
  }

  /** 最後一次 `spawn()` 實際落在哪 —— 測試用來確認攤開的方式 */
  get lastSpawnX(): number {
    return this.active[this.active.length - 1]?.startX ?? 0;
  }

  get lastSpawnY(): number {
    return this.active[this.active.length - 1]?.startY ?? 0;
  }

  spawn(
    screenX: number,
    screenY: number,
    value: number,
    damageType: DamageType,
    stack?: DamageNumberStack,
  ): void {
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

    /*
     * 單下用隨機偏移，連續多下改成**左右攤開＋逐下抬高**：
     * 隨機的話三個數字有機會疊在同一點，看起來像只打了一下。
     */
    const spread = stack && stack.count > 1
      ? {
          x: (stack.index - (stack.count - 1) / 2) * STACK_X_STEP,
          y: -stack.index * STACK_Y_STEP,
        }
      : { x: (Math.random() - 0.5) * X_SPREAD * 2, y: 0 };

    text.x = screenX + spread.x;
    text.y = screenY + spread.y;
    text.alpha = 1;
    text.visible = true;

    this.active.push({ text, startX: text.x, startY: text.y, elapsed: 0 });
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
