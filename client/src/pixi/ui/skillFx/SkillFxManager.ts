/**
 * 技能特效的播放與池化（`48-vfx.md` § 48.7.7）。
 *
 * 一個 `Container`、一組 `Graphics` 池、
 * 每幀 `update(deltaMS)`。**不掛 filter**（§ 48.2）。
 *
 * ── 一次性 vs 常駐 ──
 * 除了 `mark`（暈眩星星，§ 48.8.3）以外**全部都是一次性的**，演完就收。
 * 暈眩要撐到暈眩結束，長短由戰鬥 tick 決定，所以它循環到呼叫端 `stop(handle)`。
 *
 * 護盾**不是**常駐 —— 它只在掛上去的那一下演一顆球（§ 48.8.3）。
 * 護盾動輒 20 秒，常駐等於整整 20 秒每一幀都重建一顆長得一模一樣的球。
 */
import { Container, Graphics } from 'pixi.js';
import type { ProjectileShape } from '../projectileStyle';
import {
  SKILL_FX_ART, type EmblemKind, type MarkKind, type ShieldKind, type SkillFxPrototype,
} from './geometry';
import {
  drawAura, drawBolt, drawBurst, drawCast, drawCrack, drawDotTick, drawDrop,
  drawEmblem, drawHeal, drawImpact, drawMark, drawNova, drawPillar, drawShield,
  drawTravel,
} from './drawSkillFx';

/** 飛行段的長度下限／上限，與 `Projectile.ts` 同一組數字 */
const MIN_TRAVEL_MS = 100;
const MAX_TRAVEL_MS = 1500;

/** 預設飛行速度（px/s）。呼叫端沒指定時用它 */
export const DEFAULT_SKILL_FX_SPEED = 400;

/**
 * 飛一段距離要多久。
 *
 * 接力用得到（命中要接在飛行之後），所以拿出來共用 ——
 * 呼叫端各自算一份，改了速度上下限就會兩邊對不起來。
 */
export function travelDurationMs(dx: number, dy: number, speed = DEFAULT_SKILL_FX_SPEED): number {
  const dist = Math.hypot(dx, dy);
  return Math.max(MIN_TRAVEL_MS, Math.min(MAX_TRAVEL_MS, (dist / speed) * 1000));
}

/**
 * 同時存在的實例上限（§ 48.7.5）。
 *
 * 尖峰算得出來：一次 AoE ＝ 1 個 `travel` ＋ 1 個 `burst` ＋ 最多 10 個 `impact`，
 * 加上場上十隻怪各自的 `mark` 與 DoT 粒子。64 留了三倍餘裕。
 * 超過就丟最舊的 —— 丟最新的會讓「剛按下去的那一發沒反應」，那是最不能省的一個。
 */
export const MAX_ACTIVE_SKILL_FX = 64;

export interface SkillFxSpawnOpts {
  prototype: SkillFxPrototype;
  /** 錨點（螢幕座標）。`travel`／`drop` 的錨點是發射點／落點 */
  x: number;
  y: number;
  color?: number;
  /** `travel` 的目標點 */
  toX?: number;
  toY?: number;
  /** `travel` 的外型（§ 42.4） */
  shape?: ProjectileShape;
  /** `travel` 的速度（px/s）。給了就用距離算長度，沒給就吃 `durationMs` */
  speed?: number;
  /** `travel` 的拱起高度（px）。彈跳連鎖用，直線飛讀起來是在傳球 */
  arc?: number;
  /** `burst`／`nova` 的半徑（格） */
  radiusTiles?: number;
  /** `impact` 的暴擊強調（§ 48.7.6） */
  crit?: boolean;
  /** `impact` 的 debuff 點綴色（§ 48.7.4.3）。`null`／不給＝不點綴 */
  accent?: number | null;
  /** `impact` 的最小型態：普攻用（§ 48.7.6） */
  minimal?: boolean;
  /** `mark` 的種類 */
  markKind?: MarkKind;
  /** `shield` 的種類 */
  shieldKind?: ShieldKind;
  /** `emblem` 的種類 */
  emblemKind?: EmblemKind;
  /**
   * 覆寫設計時長。攻擊間隔壓縮走這裡（§ 48.6.4 同一個道理）——
   * 原型的設計時長是常速手感，不是播放時長。
   */
  durationMs?: number;
  /**
   * 延後多久才開始演。
   *
   * 一次施法是「起手 → 飛行 → 命中」三段接力，時序全部走這個欄位，
   * **呼叫端不排 `setTimeout`** —— 那會與 ticker 各走各的，
   * 暫停或切場景時清不掉，回來就會看到上一場的殘餘演出。
   */
  delayMs?: number;
  /** `travel`／`drop` 到點時呼叫一次 —— 飛行物「抵達」的那一幀 */
  onArrive?: () => void;
  /**
   * 演出**開始**的那一幀呼叫一次（`delayMs` 等完之後）。
   *
   * 命中回饋掛這裡，不掛 `onArrive` —— `impact` 這種原型本身就是「命中」，
   * 掛 `onArrive` 會等整個爆點演完（一百多毫秒）才跳傷害數字、才彈目標，
   * 看起來像是打完之後過一拍才生效。
   */
  onStart?: () => void;
  onDone?: () => void;
}

interface Instance {
  handle: number;
  prototype: SkillFxPrototype;
  g: Graphics;
  color: number;
  dx: number;
  dy: number;
  shape: ProjectileShape;
  arc: number;
  radiusTiles: number;
  crit: boolean;
  accent: number | null;
  minimal: boolean;
  markKind: MarkKind;
  shieldKind: ShieldKind;
  emblemKind: EmblemKind;
  elapsed: number;
  duration: number;
  loop: boolean;
  started: boolean;
  onArrive?: () => void;
  onStart?: () => void;
  onDone?: () => void;
}

export class SkillFxManager {
  readonly container = new Container();
  private pool: Graphics[] = [];
  private active: Instance[] = [];
  private nextHandle = 1;

  /** 回傳 handle；常駐原型（`mark`）要靠它收掉 */
  spawn(o: SkillFxSpawnOpts): number {
    if (this.active.length >= MAX_ACTIVE_SKILL_FX) this.retire(0);

    const dx = (o.toX ?? o.x) - o.x;
    const dy = (o.toY ?? o.y) - o.y;
    const g = this.acquire();
    g.x = o.x;
    g.y = o.y;

    const inst: Instance = {
      handle: this.nextHandle++,
      prototype: o.prototype,
      g,
      color: o.color ?? 0xffffff,
      dx,
      dy,
      shape: o.shape ?? 'circle',
      arc: o.arc ?? 0,
      radiusTiles: o.radiusTiles ?? 0,
      crit: o.crit ?? false,
      accent: o.accent ?? null,
      minimal: o.minimal ?? false,
      markKind: o.markKind ?? 'stun',
      shieldKind: o.shieldKind ?? 'shield',
      emblemKind: o.emblemKind ?? 'sword',
      /* 負的 elapsed ＝ 還在等 delayMs。等待期間 sprite 隱藏，不佔畫面也不吃繪製 */
      elapsed: -(o.delayMs ?? 0),
      duration: resolveDuration(o, dx, dy),
      /* 唯一常駐的是暈眩標記 —— 它要撐到暈眩結束，長短由戰鬥 tick 決定 */
      loop: o.prototype === 'mark',
      started: false,
      onArrive: o.onArrive,
      onStart: o.onStart,
      onDone: o.onDone,
    };

    this.active.push(inst);
    if (inst.elapsed < 0) g.visible = false;
    else this.draw(inst, 0);
    return inst.handle;
  }

  /** 常駐標記跟著怪物走 —— 怪在動，星星不能留在原地 */
  move(handle: number, x: number, y: number): void {
    const inst = this.active.find(i => i.handle === handle);
    if (!inst) return;
    inst.g.x = x;
    inst.g.y = y;
  }

  /** 收掉一個常駐標記。找不到就當作已經收過了，不報錯 */
  stop(handle: number): void {
    const idx = this.active.findIndex(i => i.handle === handle);
    if (idx >= 0) this.retire(idx);
  }

  update(deltaMS: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const inst = this.active[i];
      const before = inst.elapsed;
      inst.elapsed += deltaMS;

      if (inst.elapsed < 0) continue;
      if (before < 0) inst.g.visible = true;
      if (!inst.started) {
        inst.started = true;
        inst.onStart?.();
      }

      if (inst.loop) {
        this.draw(inst, (inst.elapsed % inst.duration) / inst.duration);
        continue;
      }

      const t = inst.elapsed / inst.duration;

      /* 到點只觸發一次。判定早就結算完了，這裡只是讓數字等演出（§ 48.7.4） */
      if (t >= 1 && before < inst.duration) inst.onArrive?.();

      if (t >= 1) {
        inst.onDone?.();
        this.retire(i);
        continue;
      }

      this.draw(inst, t);
    }
  }

  clear(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.retire(i);
  }

  destroy(): void {
    this.clear();
    for (const g of this.pool) g.destroy();
    this.pool.length = 0;
    this.container.destroy({ children: true });
  }

  get activeCount(): number {
    return this.active.length;
  }

  private draw(inst: Instance, t: number): void {
    const { g, color } = inst;
    g.clear();

    switch (inst.prototype) {
      case 'cast':
        drawCast(g, SKILL_FX_ART.cast, color, t);
        break;
      case 'travel':
        drawTravel(g, SKILL_FX_ART.travel, color, t, inst.dx, inst.dy, inst.shape, inst.arc);
        break;
      case 'bolt':
        drawBolt(g, SKILL_FX_ART.bolt, color, t, inst.dx, inst.dy);
        break;
      case 'crack':
        drawCrack(g, SKILL_FX_ART.crack, color, t, inst.dx, inst.dy);
        break;
      case 'pillar':
        drawPillar(g, SKILL_FX_ART.pillar, color, t);
        break;
      case 'impact':
        drawImpact(g, SKILL_FX_ART.impact, color, t, inst.crit, inst.accent, inst.minimal);
        break;
      case 'burst':
        drawBurst(g, SKILL_FX_ART.burst, color, t, inst.radiusTiles);
        break;
      case 'nova':
        drawNova(g, SKILL_FX_ART.nova, color, t, inst.radiusTiles);
        break;
      case 'drop':
        drawDrop(g, SKILL_FX_ART.drop, color, t, inst.shape);
        break;
      case 'heal':
        drawHeal(g, SKILL_FX_ART.heal, color, t);
        break;
      case 'aura':
        drawAura(g, SKILL_FX_ART.aura, color, t);
        break;
      case 'emblem':
        drawEmblem(g, SKILL_FX_ART.emblem, inst.emblemKind, color, t);
        break;
      case 'mark':
        drawMark(g, SKILL_FX_ART.mark, inst.markKind, t);
        break;
      case 'shield':
        drawShield(g, SKILL_FX_ART.shield, inst.shieldKind, t);
        break;
      case 'dotTick':
        drawDotTick(g, SKILL_FX_ART.dotTick, color, t);
        break;
    }
  }

  private retire(index: number): void {
    const inst = this.active[index];
    this.active.splice(index, 1);
    inst.g.clear();
    inst.g.visible = false;
    this.pool.push(inst.g);
  }

  private acquire(): Graphics {
    const g = this.pool.pop() ?? this.container.addChild(new Graphics());
    g.clear();
    g.visible = true;
    g.alpha = 1;
    return g;
  }
}

/**
 * 這一次要演多久。
 *
 * `travel` 是唯一由距離決定的 —— 飛得遠就飛得久，寫死時長的話近距離會慢動作。
 * 其餘原型吃各自的設計時長，呼叫端可以用 `durationMs` 壓縮（§ 48.6.4 同一個道理）。
 */
function resolveDuration(o: SkillFxSpawnOpts, dx: number, dy: number): number {
  if (o.durationMs !== undefined) return Math.max(1, o.durationMs);

  const art = SKILL_FX_ART;
  switch (o.prototype) {
    case 'travel':
      return travelDurationMs(dx, dy, o.speed);
    case 'cast': return art.cast.durationMs;
    /* 暴擊整段比較長 —— 衝擊環與星芒要有地方收尾 */
    case 'impact':
      return art.impact.durationMs * (o.crit ? art.impact.critDurationMul : 1);
    case 'burst': return art.burst.durationMs;
    case 'nova': return art.nova.durationMs;
    case 'drop': return art.drop.fallMs;
    case 'heal': return art.heal.durationMs;
    case 'aura': return art.aura.durationMs;
    case 'bolt': return art.bolt.durationMs;
    /* 地裂跟著投射物長，長度由呼叫端用 `durationMs` 指定 */
    case 'crack': return art.bolt.durationMs;
    case 'pillar': return art.pillar.durationMs;
    case 'emblem': return art.emblem.durationMs;
    case 'dotTick': return art.dotTick.durationMs;
    case 'mark': return art.mark.orbitMs;
    case 'shield': return art.shield.durationMs;
  }
}
