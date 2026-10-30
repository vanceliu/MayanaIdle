/**
 * 突進位移演出（`48-vfx.md` § 48.7.8）。
 */
import { describe, it, expect } from 'vitest';
import {
  DASH_ART, dashAfterimages, dashFrame, dashOffset, dashRemaining, dashTotalMs, type DashArt,
} from '../geometry';

const ART: DashArt = { ...DASH_ART, windupMs: 50, travelMs: 100, windupPullPx: 4, hopPx: 10, afterimageCount: 3, afterimageGapMs: 20 };

describe('dashRemaining', () => {
  it('起手中停在起點，演完到落點', () => {
    expect(dashRemaining(0, ART)).toBe(1);
    expect(dashRemaining(ART.windupMs, ART)).toBe(1);
    expect(dashRemaining(dashTotalMs(ART), ART)).toBe(0);
    expect(dashRemaining(dashTotalMs(ART) + 500, ART)).toBe(0);
  });

  it('路程中單調遞減', () => {
    let prev = 1;
    for (let ms = ART.windupMs; ms <= dashTotalMs(ART); ms += 5) {
      const r = dashRemaining(ms, ART);
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
  });
});

describe('dashFrame', () => {
  it('起手結束與路程開始的後縮量連續', () => {
    const before = dashFrame(ART.windupMs - 0.001, ART).pullPx;
    const after = dashFrame(ART.windupMs + 0.001, ART).pullPx;
    expect(Math.abs(before - after)).toBeLessThan(0.05);
  });

  it('離地高度在兩端為 0、中段最高', () => {
    expect(dashFrame(0, ART).liftPx).toBe(0);
    expect(dashFrame(dashTotalMs(ART), ART).liftPx).toBe(0);
    const peak = Math.max(...Array.from({ length: 21 }, (_, i) => dashFrame(ART.windupMs + i * 5, ART).liftPx));
    expect(peak).toBeCloseTo(ART.hopPx, 0);
  });
});

describe('dashOffset', () => {
  it('起點與落點重合時不位移', () => {
    expect(dashOffset(80, 0, 0, ART)).toEqual({ x: 0, y: 0 });
  });

  it('起點在起手開始、演完歸零', () => {
    expect(dashOffset(0, 64, 32, ART)).toEqual({ x: 64, y: 32 });
    expect(dashOffset(dashTotalMs(ART), 64, 32, ART)).toEqual({ x: 0, y: 0 });
  });

  it('起手後縮往起點方向延伸', () => {
    const o = dashOffset(ART.windupMs, 100, 0, ART);
    expect(o.x).toBeCloseTo(100 + ART.windupPullPx);
  });
});

describe('dashAfterimages', () => {
  it('起手中與演完後沒有殘影', () => {
    expect(dashAfterimages(ART.windupMs, ART)).toEqual([]);
    expect(dashAfterimages(dashTotalMs(ART) + ART.afterimageCount * ART.afterimageGapMs, ART)).toEqual([]);
  });

  it('路程中殘影由新到舊、越舊越淡', () => {
    const list = dashAfterimages(ART.windupMs + 90, ART);
    expect(list.length).toBe(ART.afterimageCount);
    for (let i = 1; i < list.length; i++) {
      expect(list[i].elapsedMs).toBeLessThan(list[i - 1].elapsedMs);
      expect(list[i].alpha).toBeLessThan(list[i - 1].alpha);
    }
  });
});
