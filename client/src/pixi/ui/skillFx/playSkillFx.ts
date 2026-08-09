/**
 * 一次施法的接力（`48-vfx.md` § 48.7.3 的「起手 → 送達 → 落點」）。
 *
 * 把 `SkillFxPlan` 攤成幾個帶 `delayMs` 的 `spawn()`。
 * **時序全部走 `delayMs`，不排 `setTimeout`** —— 那會與 ticker 各走各的，
 * 暫停或切場景時清不掉。
 *
 * 遊戲與調校頁都呼叫這一支，兩邊各接一份必然分岔。
 */
import type { SkillFxManager } from './SkillFxManager';
import { travelDurationMs } from './SkillFxManager';
import { SKILL_FX_ART } from './geometry';
import type { SkillFxPlan, SkillFxWeaponAction } from './skillFxStyle';

/** 被這次技能打到的一個目標 */
export interface SkillFxTarget {
  x: number;
  y: number;
  /** 暴擊強調（§ 48.7.6） */
  crit?: boolean;
  /**
   * 演出到點時呼叫一次。**傷害數字掛在這裡**。
   * 判定早就結算完了，這只是讓數字等演出（§ 48.7.4）。
   */
  onLand?: () => void;
}

export interface PlaySkillFxOpts {
  plan: SkillFxPlan;
  /** 施法者腳下（螢幕座標）。起手環與自身中心爆都畫在這裡 */
  fromX: number;
  fromY: number;
  /**
   * 投射物離開角色的位置（螢幕座標）。預設＝腳下。
   *
   * **不可以拿它取代 `fromX/fromY`** —— 弓的箭要從弓上出去
   * （`weaponMuzzle()`），但**起手環仍然畫在腳下**。
   * 兩者共用一個值的話，起手環會跟著跑到弓上，讀起來像地上浮著一個圈。
   */
  muzzleX?: number;
  muzzleY?: number;
  /** 落點：單體＝目標身上，AoE＝圓心。`nova` 用不到 */
  toX: number;
  toY: number;
  targets: SkillFxTarget[];
  /** 飛行速度（px/s） */
  speed?: number;
  /**
   * 武器演出由呼叫端自己起動 `WeaponSprite`（§ 48.6），這裡不碰武器 ——
   * 只在該出手的那一刻回報是哪一種動作。
   */
  onWeaponAction?: (kind: SkillFxWeaponAction) => void;
  /**
   * 武器「打到／放出去」的時點（ms）——
   * 近戰是揮到底、弓是放箭。兩者都用這一個值。
   *
   * 呼叫端算好傳進來（`weaponPlaybackMs() × motion.tStrike`）；
   * 這裡不 import 武器幾何，特效不該知道弓拉多久。
   */
  weaponStrikeMs?: number;
  /**
   * 命中點與腳下差多少 px（正值＝往下）。
   *
   * 命中點抬在身體高度，但**火柱是從地上竄起的** —— 呼叫端把這個差值傳進來，
   * 火柱才落在腳邊而不是浮在半空。
   */
  groundLift?: number;
}

/**
 * 起手與下一段的重疊量。
 *
 * 起手環演到七成就接飛行段 —— 等它完全收乾淨再射，中間會有一格空白，
 * 讀起來是「先亮一下、停頓、才發射」。
 */
const CAST_LEAD = 0.7;

/** 呼叫端沒給時的保守值：近戰揮到底約這個時間，弓拉滿也差不多 */
const DEFAULT_WEAPON_STRIKE_MS = 180;

/**
 * 連鎖每一跳之間的間隔，以一段電弧的長度為 1。
 *
 * **要小於 1**，也就是上一段還沒消完下一段就亮起來 ——
 * 等前一段完全消失再跳，讀起來是「放了好幾次電」而不是「一條鏈」。
 */
const CHAIN_HOP_OVERLAP = 0.62;

/**
 * 彈跳連鎖每一段的速度（px/s）。
 *
 * 比一般投射物快 —— 那是已經打出去的東西被彈開，不是重新射一發；
 * 用一般速度會讀成「連續施法好幾次」。
 */
const CHAIN_BOUNCE_SPEED = 620;

/** 回傳整段演出的長度（ms），呼叫端要排收尾時用得到 */
export function playSkillFx(fx: SkillFxManager, o: PlaySkillFxOpts): number {
  const { plan, fromX, fromY, toX, toY, targets } = o;
  const art = SKILL_FX_ART;
  /* 箭／彈丸從槍口出去；起手環與自身中心爆一律在腳下 */
  const muzzleX = o.muzzleX ?? fromX;
  const muzzleY = o.muzzleY ?? fromY;

  let cursor = 0;

  if (plan.cast) {
    fx.spawn({ prototype: 'cast', x: fromX, y: fromY, color: plan.color, delayMs: 0 });
    cursor = art.cast.durationMs * CAST_LEAD;
  }

  /*
   * 拉弓（§ 48.6）：箭要等**放箭那一格**才出去，不是動作一開始。
   * 起手演完才拉弓 —— 兩個同時來會看到弓在光環裡憑空出現。
   */
  if (plan.weapon === 'shoot') {
    o.onWeaponAction?.('shoot');
    cursor += o.weaponStrikeMs ?? DEFAULT_WEAPON_STRIKE_MS;
  }

  /*
   * 連鎖（§ 48.7.3）：電打到第一隻之後，**從那一隻再往下一隻跳**。
   *
   * 與齊射的差別在起點 —— 齊射每一發都從施法者出去，連鎖是接力。
   * 順序照 `targets` 走，也就是實際命中名單：**不會連到沒被打到的怪**，
   * 否則畫面就在騙人（§ 48.1）。
   */
  if (plan.delivery === 'chain') {
    let fromPtX = muzzleX;
    let fromPtY = muzzleY;
    let at = cursor;

    const bounce = plan.chainStyle === 'bounce';

    for (const t of targets) {
      /*
       * 彈跳的一段是**真的飛過去**，所以命中要等它到；
       * 電弧幾乎是瞬間的，命中接在弧線亮起的那一刻就好。
       */
      const hopMs = bounce
        ? travelDurationMs(t.x - fromPtX, t.y - fromPtY, o.speed ?? CHAIN_BOUNCE_SPEED)
        : art.bolt.durationMs;

      fx.spawn(bounce
        ? {
            prototype: 'travel',
            x: fromPtX, y: fromPtY, toX: t.x, toY: t.y,
            color: plan.color, shape: plan.shape,
            speed: o.speed ?? CHAIN_BOUNCE_SPEED,
            /* 拱一點 —— 直線飛過去讀起來是在傳球，不是被彈開 */
            arc: art.travel.bounceArc,
            delayMs: at,
          }
        : {
            prototype: 'bolt',
            x: fromPtX, y: fromPtY, toX: t.x, toY: t.y,
            color: plan.color, delayMs: at,
          });

      fx.spawn({
        prototype: 'impact',
        x: t.x, y: t.y, color: plan.color, crit: t.crit, accent: plan.accent,
        delayMs: at + (bounce ? hopMs : hopMs * 0.4),
        onStart: t.onLand,
      });

      fromPtX = t.x;
      fromPtY = t.y;
      /* 彈跳一段接一段，不重疊 —— 同一顆球不可能同時在兩個地方 */
      at += bounce ? hopMs : hopMs * CHAIN_HOP_OVERLAP;
    }
    return at + art.impact.durationMs;
  }

  /*
   * 多段（§ 48.7.3）：**同一個目標**連著吃好幾發。
   *
   * 與齊射的差別在目標 —— 齊射是每個目標各一發。
   * 三連射走的是普攻的演出，所以只有箭，沒有命中爆點（`landing: 'none'`）。
   * 箭上下錯開一點，完全重疊會看起來只有一支。
   */
  if (plan.hits > 1) {
    const t0 = targets[0];
    if (!t0) return cursor;

    let last = cursor;
    for (let i = 0; i < plan.hits; i++) {
      const at = cursor + i * art.travel.multiHitStaggerMs;
      const spread = (i - (plan.hits - 1) / 2) * art.travel.multiHitSpread;
      /* 每一發各自判定命中，所以傷害數字也是各自一個 */
      const hit = targets[i] ?? t0;
      const ms = travelDurationMs(t0.x - muzzleX, t0.y - (muzzleY + spread), o.speed);

      fx.spawn({
        prototype: 'travel',
        x: muzzleX, y: muzzleY + spread, toX: t0.x, toY: t0.y,
        color: plan.color, shape: plan.shape, speed: o.speed,
        delayMs: at,
        onArrive: hit.onLand,
      });
      last = Math.max(last, at + ms);
    }
    return last;
  }

  /*
   * 齊射（§ 48.7.4）：每個目標各一發，各自飛、各自命中、沒有範圍爆。
   * 走的是完全不同的一條路，所以在這裡就分岔 ——
   * 硬要和「一發到圓心」共用一段程式，兩邊的時序會互相牽制。
   */
  if (plan.volley && (plan.delivery === 'travel' || plan.delivery === 'drop')) {
    const stagger = plan.delivery === 'drop'
      ? art.drop.volleyStaggerMs
      : art.travel.volleyStaggerMs;
    let last = cursor;

    targets.forEach((t, i) => {
      const at = cursor + i * stagger;
      const ms = plan.delivery === 'drop'
        ? art.drop.fallMs
        : travelDurationMs(t.x - muzzleX, t.y - muzzleY, o.speed);

      fx.spawn(plan.delivery === 'drop'
        ? {
            prototype: 'drop', x: t.x, y: t.y,
            color: plan.color, shape: plan.shape, delayMs: at,
          }
        : {
            prototype: 'travel',
            x: muzzleX, y: muzzleY, toX: t.x, toY: t.y,
            color: plan.color, shape: plan.shape, speed: o.speed,
            delayMs: at,
          });

      fx.spawn({
        prototype: 'impact',
        x: t.x, y: t.y, color: plan.color, crit: t.crit, accent: plan.accent,
        minimal: plan.minimalImpact,
        delayMs: at + ms,
        onStart: t.onLand,
      });

      last = Math.max(last, at + ms + art.impact.durationMs);
    });

    return last;
  }

  switch (plan.delivery) {
    case 'travel': {
      const ms = travelDurationMs(toX - muzzleX, toY - muzzleY, o.speed);
      fx.spawn({
        prototype: 'travel',
        x: muzzleX, y: muzzleY, toX, toY,
        color: plan.color, shape: plan.shape, speed: o.speed,
        delayMs: cursor,
      });
      /*
       * 途中的附加演出（地裂術的地縫）：**與投射物同一段時間**，
       * 從施法者腳下往目標長。錨在腳下不是槍口 —— 地縫是地上的東西。
       */
      if (plan.trailFx === 'crack') {
        fx.spawn({
          prototype: 'crack',
          x: fromX, y: fromY, toX, toY,
          color: plan.color,
          /* 稍微比投射物長一點，讓地縫在命中之後還留一下 */
          durationMs: ms * 1.35,
          delayMs: cursor,
        });
      }
      cursor += ms;
      break;
    }
    case 'drop': {
      fx.spawn({
        prototype: 'drop', x: toX, y: toY,
        color: plan.color, shape: plan.shape, delayMs: cursor,
      });
      cursor += art.drop.fallMs;
      break;
    }
    case 'melee': {
      /* 揮擊由呼叫端起動；命中接在揮到底那一格，不是動作一開始 */
      o.onWeaponAction?.('swing');
      cursor += o.weaponStrikeMs ?? DEFAULT_WEAPON_STRIKE_MS;
      break;
    }
    case 'none':
      break;
  }

  switch (plan.landing) {
    /* 沿用普攻的演出：技能自己不加東西 */
    case 'none':
      break;

    case 'pillar':
      /* 火柱從**地上**竄起，所以錨在目標腳下，不是被打到的身體高度 */
      for (const t of targets) {
        fx.spawn({
          prototype: 'pillar',
          x: t.x, y: t.y + (o.groundLift ?? 0),
          color: plan.color, delayMs: cursor, onStart: t.onLand,
        });
      }
      cursor += art.pillar.durationMs;
      break;

    case 'impact':
      /* 每個目標各一個命中點。單體技能就是一個，三連射是三個 */
      for (const t of targets) {
        fx.spawn({
          prototype: 'impact',
          x: t.x, y: t.y, color: plan.color, crit: t.crit, accent: plan.accent,
          minimal: plan.minimalImpact,
          delayMs: cursor,
          onStart: t.onLand,
        });
      }
      break;

    case 'burst':
      /* AoE 是一發（§ 48.7.4）：圓心爆一次，各目標只各自跳自己的數字 */
      fx.spawn({
        prototype: 'burst',
        x: toX, y: toY, color: plan.color, radiusTiles: plan.radiusTiles,
        delayMs: cursor,
      });
      for (const t of targets) {
        if (!t.onLand) continue;
        fx.spawn({
          prototype: 'impact', x: t.x, y: t.y, color: plan.color, crit: t.crit,
          accent: plan.accent, delayMs: cursor, onStart: t.onLand,
        });
      }
      cursor += art.burst.durationMs;
      break;

    case 'nova':
      fx.spawn({
        prototype: 'nova',
        x: fromX, y: fromY, color: plan.color, radiusTiles: plan.radiusTiles,
        delayMs: cursor,
      });
      for (const t of targets) {
        if (!t.onLand) continue;
        fx.spawn({
          prototype: 'impact', x: t.x, y: t.y, color: plan.color, crit: t.crit,
          accent: plan.accent, delayMs: cursor, onStart: t.onLand,
        });
      }
      cursor += art.nova.durationMs;
      break;

    case 'heal': {
      /* 沒有指定目標就治自己 —— 多數治癒技能的 range 是 0 */
      const list = targets.length > 0 ? targets : [{ x: fromX, y: fromY }];
      for (const t of list) {
        fx.spawn({
          prototype: 'heal', x: t.x, y: t.y, color: plan.color,
          delayMs: cursor, onStart: t.onLand,
        });
      }
      cursor += art.heal.durationMs;
      break;
    }

    case 'aura': {
      const list = targets.length > 0 ? targets : [{ x: fromX, y: fromY }];
      for (const t of list) {
        /*
         * 擋傷害那一類改演球（§ 48.8.3），**取代**藍環而不是疊在上面 ——
         * 球已經把「有東西罩住你」講完了，底下再加一圈地面環只是多一個圖形。
         */
        fx.spawn(plan.shield
          ? {
              prototype: 'shield', x: t.x, y: t.y,
              shieldKind: plan.shield, delayMs: cursor, onStart: t.onLand,
            }
          : {
              prototype: 'aura', x: t.x, y: t.y, color: plan.color,
              delayMs: cursor, onStart: t.onLand,
            });
        /*
         * 徽記與藍環**同時起跑但各走各的長度**（§ 48.8.1）：
         * 環是 0.3 秒的一下，符號要讀得懂就得停久一點。
         * 排在環之後的話，玩家會先看到環結束、再冒出一把劍，讀成兩件事。
         */
        if (plan.emblem) {
          fx.spawn({
            prototype: 'emblem', x: t.x, y: t.y, color: plan.color,
            emblemKind: plan.emblem, delayMs: cursor,
          });
        }
      }
      const bodyMs = plan.shield ? art.shield.durationMs : art.aura.durationMs;
      cursor += plan.emblem ? Math.max(bodyMs, art.emblem.durationMs) : bodyMs;
      break;
    }
  }

  if (plan.landing === 'impact') {
    /* 有暴擊的話尾巴比較長，時間軸要跟著算，不然最後一段會被切掉 */
    const critMul = targets.some(t => t.crit) ? art.impact.critDurationMul : 1;
    cursor += art.impact.durationMs * critMul;
  }
  return cursor;
}
