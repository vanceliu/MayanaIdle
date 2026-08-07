import { describe, it, expect } from 'vitest';
import { BoundsContext } from './boundsContext';
import { drawPawn, type PawnLook } from '../drawPawn';
import { HAIR_RENDER, resolveCapCfg } from '../hairRender';
import { PAWN_GEOM, PAWN_DIRECTIONS } from '../geometry';
import {
  PAWN_TEX_W, PAWN_TEX_H, PAWN_ANCHOR_X, PAWN_ANCHOR_Y, pawnLookKey, toPawnLook,
} from '../pawnTexture';
import {
  HAIR_STYLES, HAIR_TUNABLES, LASH_TUNABLES,
  createDefaultAppearance, type HairStyleId, type HairTune, type Lash,
} from '../../../../models/appearance';

const GEOM_NO_SHADOW = { ...PAWN_GEOM, shadow: 0 };

function look(hair: HairStyleId, tune?: HairTune, lash: Lash = { on: 1, len: 14, curl: 9, w: 45 }): PawnLook {
  return {
    hair, skin: '#e8c9a0', hairColor: '#4a3728', eyeColor: '#24506e',
    lash, cloth: '#8fa3c4', cap: resolveCapCfg(hair, tune),
  };
}

/** 每個可調項推到兩端，加上全預設 —— 玩家能做出來的極端組合 */
const TUNE_CASES: { label: string; tune?: HairTune }[] = [
  { label: '預設' },
  ...HAIR_TUNABLES.flatMap((t) => [
    { label: `${t.key}=${t.min}`, tune: { [t.key]: t.min } as HairTune },
    { label: `${t.key}=${t.max}`, tune: { [t.key]: t.max } as HairTune },
  ]),
  {
    label: '全部推到最大',
    tune: Object.fromEntries(HAIR_TUNABLES.map((t) => [t.key, t.max])) as HairTune,
  },
];

const LASH_MAX: Lash = {
  on: 1,
  ...Object.fromEntries(LASH_TUNABLES.map((t) => [t.key, t.max])),
} as Lash;

describe('drawPawn', () => {
  it('13 髮型 × 4 朝向都畫得完，不拋錯', () => {
    for (const h of HAIR_STYLES) {
      for (const dir of PAWN_DIRECTIONS) {
        expect(() => drawPawn(new BoundsContext(), 0, 0, dir, look(h.id), PAWN_GEOM)).not.toThrow();
      }
    }
  });

  /**
   * NaN 是這套繪製最容易犯又最難發現的錯：canvas 會**靜默丟掉**
   * 含 NaN 的 path 指令，畫面上只表現成「參數沒作用」，不會報錯。
   * `capCfg` 少一個鍵就會這樣（實際發生過）。
   */
  it('任何髮型／朝向／微調組合都不產生 NaN 座標', () => {
    for (const h of HAIR_STYLES) {
      for (const dir of PAWN_DIRECTIONS) {
        for (const c of TUNE_CASES) {
          const ctx = new BoundsContext();
          drawPawn(ctx, 0, 0, dir, look(h.id, c.tune, LASH_MAX), PAWN_GEOM);
          expect(ctx.badValues, `${h.label} / ${dir.label} / ${c.label}`).toEqual([]);
        }
      }
    }
  });

  it('任何組合都畫得進貼圖範圍，不會被切掉', () => {
    for (const h of HAIR_STYLES) {
      for (const dir of PAWN_DIRECTIONS) {
        for (const c of TUNE_CASES) {
          const ctx = new BoundsContext();
          drawPawn(ctx, PAWN_ANCHOR_X, PAWN_ANCHOR_Y, dir, look(h.id, c.tune, LASH_MAX), GEOM_NO_SHADOW);
          const where = `${h.label} / ${dir.label} / ${c.label}`;
          expect(ctx.left, `${where} 左緣`).toBeGreaterThanOrEqual(0);
          expect(ctx.top, `${where} 上緣`).toBeGreaterThanOrEqual(0);
          expect(ctx.right, `${where} 右緣`).toBeLessThanOrEqual(PAWN_TEX_W);
          expect(ctx.bottom, `${where} 下緣`).toBeLessThanOrEqual(PAWN_TEX_H);
        }
      }
    }
  });

  it('腳底貼齊傳進去的地磚中心 —— 與現行圓圈同一套對齊', () => {
    /* 軀幹底部就在 gy，所以外框下緣不會比 gy 低（描邊除外） */
    const ctx = new BoundsContext();
    drawPawn(ctx, 0, 0, PAWN_DIRECTIONS[0], look('bald'), GEOM_NO_SHADOW);
    expect(ctx.bottom).toBeLessThanOrEqual(PAWN_GEOM.outline / 10);
    expect(ctx.bottom).toBeGreaterThan(-1);
  });

  it('背面不畫眼睛', () => {
    const front = new BoundsContext();
    const back = new BoundsContext();
    drawPawn(front, 0, 0, PAWN_DIRECTIONS[0], look('bald'), GEOM_NO_SHADOW);
    drawPawn(back, 0, 0, PAWN_DIRECTIONS[3], look('bald'), GEOM_NO_SHADOW);
    /* 光頭正面只多了眼睛，所以正面的外框一定不比背面窄 */
    expect(front.right - front.left).toBeGreaterThan(back.right - back.left - 0.001);
  });
});

describe('髮型繪製設定', () => {
  it('每個髮型都有一組繪製設定', () => {
    for (const h of HAIR_STYLES) {
      expect(HAIR_RENDER[h.id], h.label).toBeDefined();
    }
    expect(Object.keys(HAIR_RENDER)).toHaveLength(HAIR_STYLES.length);
  });

  /** 缺一個鍵不會報錯，只會讓那段路徑靜默變成一條直線 */
  it('每個髮型的 capCfg 九項都是有限數字', () => {
    for (const h of HAIR_STYLES) {
      for (const [k, v] of Object.entries(HAIR_RENDER[h.id].capCfg)) {
        expect(Number.isFinite(v), `${h.label}.capCfg.${k} = ${v}`).toBe(true);
      }
      expect(Object.keys(HAIR_RENDER[h.id].capCfg)).toHaveLength(9);
    }
  });

  it('resolveCapCfg 不會改到共用的設定 —— 改一隻角色不該動到全部', () => {
    const before = { ...HAIR_RENDER.twin.capCfg };
    const resolved = resolveCapCfg('twin', { front: 70, peak: 70 });
    resolved.front = 999;

    expect(HAIR_RENDER.twin.capCfg).toEqual(before);
  });

  it('微調值蓋過髮型基準，沒設的沿用基準', () => {
    const resolved = resolveCapCfg('twin', { front: 55 });
    expect(resolved.front).toBe(55);
    expect(resolved.peak).toBe(HAIR_RENDER.twin.capCfg.peak);
  });
});

describe('貼圖快取的鍵', () => {
  const base = toPawnLook(createDefaultAppearance(), '#8fa3c4');

  it('朝向不同就是不同的鍵', () => {
    const keys = PAWN_DIRECTIONS.map((d) => pawnLookKey(base, d.id));
    expect(new Set(keys).size).toBe(PAWN_DIRECTIONS.length);
  });

  /**
   * 鍵漏掉任何一個會影響畫面的欄位，換了那個欄位的角色會拿到
   * 前一個造型的貼圖，而且完全不會報錯。所以逐欄位確認鍵會變。
   */
  it.each([
    ['hair', { hair: 'twinlong' as const }],
    ['skin', { skin: '#7c4f2c' }],
    ['hairColor', { hairColor: '#c9a227' }],
    ['eyeColor', { eyeColor: '#e3c765' }],
    ['cloth', { cloth: '#ff0000' }],
    ['eyes', { eyes: 'none' as const }],
  ])('改 %s 會換一把鍵', (_label, patch) => {
    expect(pawnLookKey({ ...base, ...patch }, 'front')).not.toBe(pawnLookKey(base, 'front'));
  });

  it.each(LASH_TUNABLES.map((t) => t.key))('改睫毛的 %s 會換一把鍵', (key) => {
    const patched = { ...base, lash: { ...base.lash, on: 1 as const, [key]: base.lash[key] + 1 } };
    expect(pawnLookKey(patched, 'front')).not.toBe(pawnLookKey({ ...base, lash: { ...base.lash, on: 1 } }, 'front'));
  });

  it.each(HAIR_TUNABLES.map((t) => t.key))('改髮型微調的 %s 會換一把鍵', (key) => {
    const patched = { ...base, cap: { ...base.cap, [key]: base.cap[key] + 1 } };
    expect(pawnLookKey(patched, 'front')).not.toBe(pawnLookKey(base, 'front'));
  });

  it('同一個造型同一個朝向永遠是同一把鍵', () => {
    const other = toPawnLook(createDefaultAppearance(), '#8fa3c4');
    expect(pawnLookKey(other, 'front')).toBe(pawnLookKey(base, 'front'));
  });
});
