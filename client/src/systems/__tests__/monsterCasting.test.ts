import { describe, it, expect } from 'vitest';
import {
  tickMonsterCombat,
  createMonsterCombatContext,
  castDamageMultiplier,
  castProgress,
  CAST_TIME_MIN,
  CAST_TIME_MAX,
  CAST_DAMAGE_MULT_MIN,
  CAST_DAMAGE_MULT_MAX,
  DEFAULT_MONSTER_ATTACK_CONFIG,
  type MonsterCombatContext,
} from '../monsterCombatFSM';
import type { MapData } from '../../models/mapControl';

/** 怪物詠唱（`25-monster-system.md` § 25.11） */

/** 全空地圖（0 ＝ 可通行），視線一律通 */
const MAP: MapData = {
  width: 20,
  height: 20,
  tiles: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 0)),
} as unknown as MapData;

const CONFIG = DEFAULT_MONSTER_ATTACK_CONFIG;
const AT = { x: 1, y: 1 };
const NEAR = { x: 2, y: 1 };
const FAR = { x: 10, y: 1 };

/** 依序回傳指定值，用完停在最後一個 */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** 推進到 `attacking` 並讓攻擊計時器剛好滿 */
function readyToSwing(): MonsterCombatContext {
  const ctx = createMonsterCombatContext();
  ctx.state = 'attacking';
  ctx.attackTimer = CONFIG.attackInterval;
  return ctx;
}

describe('詠唱倍率（§ 25.11）', () => {
  it('讀條越久打越痛，兩端對上設計區間', () => {
    expect(castDamageMultiplier(CAST_TIME_MIN)).toBe(CAST_DAMAGE_MULT_MIN);
    expect(castDamageMultiplier(CAST_TIME_MAX)).toBe(CAST_DAMAGE_MULT_MAX);
  });

  it('中間值線性內插', () => {
    expect(castDamageMultiplier(1200)).toBeCloseTo(1.25, 5);
  });

  it('超出範圍的讀條時間夾回兩端', () => {
    expect(castDamageMultiplier(0)).toBe(CAST_DAMAGE_MULT_MIN);
    expect(castDamageMultiplier(99999)).toBe(CAST_DAMAGE_MULT_MAX);
  });
});

describe('詠唱狀態機（§ 25.11）', () => {
  it('擲骰命中就進 casting，這一拍不出手', () => {
    const ctx = readyToSwing();
    const r = tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0.1, 0));

    expect(r.action).toBe('none');
    expect(ctx.state).toBe('casting');
    expect(ctx.castTime).toBe(CAST_TIME_MIN);
  });

  it('擲骰沒中就照舊瞬發，不帶倍率', () => {
    const ctx = readyToSwing();
    const r = tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0.9));

    expect(r.action).toBe('attack');
    expect(r.damageMultiplier).toBeUndefined();
    expect(ctx.state).toBe('attacking');
  });

  it('讀條時間 roll 在 900~1500ms 之間', () => {
    for (const roll of [0, 0.5, 1]) {
      const ctx = readyToSwing();
      tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0, roll));
      expect(ctx.castTime).toBeGreaterThanOrEqual(CAST_TIME_MIN);
      expect(ctx.castTime).toBeLessThanOrEqual(CAST_TIME_MAX);
    }
  });

  it('讀條完成才出手，並帶對應倍率', () => {
    const ctx = readyToSwing();
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0, 1)); // castTime = 1500

    const mid = tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 1000, false, seq(0.9));
    expect(mid.action).toBe('none');
    expect(ctx.state).toBe('casting');

    const done = tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 600, false, seq(0.9));
    expect(done.action).toBe('attack');
    expect(done.damageMultiplier).toBe(CAST_DAMAGE_MULT_MAX);
    expect(ctx.state).toBe('attacking');
  });

  it('出手後攻擊計時器歸零 —— 讀條時間是疊加在間隔之後的', () => {
    const ctx = readyToSwing();
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0, 0));
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, CAST_TIME_MAX, false, seq(0.9));

    expect(ctx.attackTimer).toBe(0);
  });
});

describe('詠唱的中止與不中止（§ 25.11.1）', () => {
  it('走出射程就中止，而且不出手', () => {
    const ctx = readyToSwing();
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0, 0));

    const r = tickMonsterCombat(ctx, AT, FAR, CONFIG, MAP, 16, false, seq(0.9));

    expect(r.action).toBe('chase');
    expect(ctx.state).toBe('chasing');
    expect(ctx.castTime).toBe(0);
  });

  it('拉到脫離範圍外會回到 roaming，詠唱一併清掉', () => {
    const ctx = readyToSwing();
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0, 0));

    const r = tickMonsterCombat(ctx, AT, { x: 19, y: 19 }, CONFIG, MAP, 16, false, seq(0.9));

    expect(r.action).toBe('leash');
    expect(ctx.state).toBe('roaming');
    expect(ctx.castTime).toBe(0);
  });

  it('暈眩是暫停讀條，不是中止', () => {
    const ctx = readyToSwing();
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0, 1));
    const before = ctx.castTimer;

    const r = tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 500, true, seq(0.9));

    expect(r.action).toBe('none');
    expect(ctx.state).toBe('casting');
    expect(ctx.castTimer).toBe(before);
  });

  it('暈眩中絕不出手，就算經過的時間早就超過讀條長度', () => {
    const ctx = readyToSwing();
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0, 1)); // castTime = 1500

    const r = tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 99999, true, seq(0.9));

    expect(r.action).toBe('none');
    expect(ctx.state).toBe('casting');
    expect(ctx.castTimer).toBe(0);
  });

  it('暈眩解除後從原本的進度接著讀，不重來也不跳過', () => {
    const ctx = readyToSwing();
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0, 1)); // castTime = 1500
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 900, false, seq(0.9));
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 5000, true, seq(0.9));

    expect(ctx.castTimer).toBe(900);
    const r = tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 600, false, seq(0.9));
    expect(r.action).toBe('attack');
  });
});

describe('詠唱進度（給頭上的詠唱條）', () => {
  it('沒在詠唱回 0', () => {
    expect(castProgress(createMonsterCombatContext())).toBe(0);
    expect(castProgress(readyToSwing())).toBe(0);
  });

  it('讀條中回 0~1', () => {
    const ctx = readyToSwing();
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 0, false, seq(0, 1)); // 1500ms
    tickMonsterCombat(ctx, AT, NEAR, CONFIG, MAP, 750, false, seq(0.9));

    expect(castProgress(ctx)).toBeCloseTo(0.5, 5);
  });
});
