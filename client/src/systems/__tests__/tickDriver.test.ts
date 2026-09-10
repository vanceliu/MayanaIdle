import { describe, it, expect } from 'vitest';
import { createTickDriver, lerpPosition, MAX_CATCHUP_TICKS } from '../tickDriver';

describe('tickDriver（固定 300ms 步長）', () => {
  it('累積未滿一 tick 不跑步，alpha 反映進度', () => {
    const steps: number[] = [];
    const d = createTickDriver(ms => steps.push(ms), 300);
    expect(d.frame(100)).toBe(0);
    expect(steps).toEqual([]);
    expect(d.alpha()).toBeCloseTo(1 / 3);
  });

  it('滿一 tick 跑一步，餘量保留', () => {
    const steps: number[] = [];
    const d = createTickDriver(ms => steps.push(ms), 300);
    expect(d.frame(350)).toBe(1);
    expect(steps).toEqual([300]);
    expect(d.alpha()).toBeCloseTo(50 / 300);
  });

  it('一幀可補跑多個 tick，上限 MAX_CATCHUP_TICKS 後丟棄累積', () => {
    let n = 0;
    const d = createTickDriver(() => n++, 300);
    expect(d.frame(300 * 3)).toBe(3);
    expect(n).toBe(3);
    expect(d.frame(300 * 100)).toBe(MAX_CATCHUP_TICKS);
    expect(d.alpha()).toBe(0);
  });

  it('step 直接跑一步，reset 清空累積', () => {
    let n = 0;
    const d = createTickDriver(() => n++, 300);
    d.step();
    expect(n).toBe(1);
    d.frame(200);
    d.reset();
    expect(d.alpha()).toBe(0);
  });
});

describe('lerpPosition', () => {
  it('無前一位置或 alpha 1 時回目前位置', () => {
    expect(lerpPosition(undefined, { x: 3, y: 4 }, 0.5)).toEqual({ x: 3, y: 4 });
    expect(lerpPosition({ x: 0, y: 0 }, { x: 3, y: 4 }, 1)).toEqual({ x: 3, y: 4 });
  });

  it('線性插值', () => {
    expect(lerpPosition({ x: 0, y: 0 }, { x: 2, y: 4 }, 0.5)).toEqual({ x: 1, y: 2 });
  });
});
