import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDefaultAppearance, type Appearance } from '../../../../models/appearance';

/**
 * 烘焙與快取。
 *
 * jsdom 沒有 canvas，所以把 `getContext('2d')` 換成一個什麼都不做的假 ctx，
 * 並把 `Texture.from()` 換成會回傳可辨識物件的假的 —— 這樣才驗得出
 * 「同造型不重烘」「不同造型要重烘」這兩件事。
 * 形狀本身由 `pawnDraw.test.ts` 負責，這裡只管烘幾次、烘多大。
 */
let textureSeq = 0;
const textureFrom = vi.fn((source: unknown) => ({
  id: ++textureSeq,
  source,
  destroy: vi.fn(),
}));

vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  return { ...actual, Texture: { from: (s: unknown) => textureFrom(s) } };
});

const {
  getPawnTexture, toPawnLook, pawnLookKey,
  clearPawnTextureCache, pawnTextureCacheSize,
  PAWN_TEX_W, PAWN_TEX_H, PAWN_BAKE_SCALE, PAWN_ANCHOR_X, PAWN_ANCHOR_Y,
} = await import('../pawnTexture');

/** 什麼都不做但不會拋錯的 2D context */
function stubCtx(): CanvasRenderingContext2D {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: () => () => {},
    set: () => true,
  });
}

let getContextSpy: ReturnType<typeof vi.spyOn>;

function look(patch: Partial<Appearance> = {}) {
  return toPawnLook({ ...createDefaultAppearance(), ...patch }, '#8fa3c4');
}

describe('角色貼圖烘焙', () => {
  beforeEach(() => {
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => stubCtx() as unknown as null);
    textureFrom.mockClear();
    clearPawnTextureCache();
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    clearPawnTextureCache();
  });

  it('烘出來的畫布是貼圖尺寸乘上超取樣倍率', () => {
    getPawnTexture(look(), 'front');
    const canvas = textureFrom.mock.calls[0][0] as HTMLCanvasElement;
    expect(canvas.width).toBe(PAWN_TEX_W * PAWN_BAKE_SCALE);
    expect(canvas.height).toBe(PAWN_TEX_H * PAWN_BAKE_SCALE);
  });

  it('腳底錨點落在貼圖範圍內', () => {
    expect(PAWN_ANCHOR_X).toBeGreaterThan(0);
    expect(PAWN_ANCHOR_X).toBeLessThan(PAWN_TEX_W);
    expect(PAWN_ANCHOR_Y).toBeGreaterThan(0);
    expect(PAWN_ANCHOR_Y).toBeLessThan(PAWN_TEX_H);
  });

  /** 城鎮裡十幾個 NPC 常常只有幾種造型，重烘是白費工 */
  it('同造型同朝向只烘一次，之後共用同一張', () => {
    const a = getPawnTexture(look(), 'front');
    const b = getPawnTexture(look(), 'front');
    expect(b).toBe(a);
    expect(textureFrom).toHaveBeenCalledTimes(1);
    expect(pawnTextureCacheSize()).toBe(1);
  });

  it('四個朝向各烘一張', () => {
    for (const d of ['front', 'right', 'left', 'back'] as const) getPawnTexture(look(), d);
    expect(textureFrom).toHaveBeenCalledTimes(4);
    expect(pawnTextureCacheSize()).toBe(4);
  });

  it.each([
    ['髮型', { hair: 'twinlong' as const }],
    ['膚色', { skin: '#7c4f2c' }],
    ['髮色', { hairColor: '#c9a227' }],
    ['眼色', { eyeColor: '#e3c765' }],
    ['睫毛', { lash: { on: 1 as const, len: 20, curl: 9, w: 45 } }],
    ['髮型微調', { tune: { part: { front: 60 } } }],
  ])('換了%s就是另一張貼圖', (_label, patch) => {
    const a = getPawnTexture(look(), 'front');
    const b = getPawnTexture(look(patch), 'front');
    expect(b).not.toBe(a);
    expect(pawnTextureCacheSize()).toBe(2);
  });

  it('衣色不同也要分開 —— 玩家與 NPC 只差衣色時不能共用', () => {
    const base = createDefaultAppearance();
    const a = getPawnTexture(toPawnLook(base, '#8fa3c4'), 'front');
    const b = getPawnTexture(toPawnLook(base, '#5f9e6a'), 'front');
    expect(b).not.toBe(a);
  });

  it('只有選中髮型的微調會影響貼圖 —— 別的髮型的微調不該讓它重烘', () => {
    const a = getPawnTexture(look(), 'front');
    const b = getPawnTexture(look({ tune: { twinlong: { front: 60 } } }), 'front');
    expect(b).toBe(a);
    expect(textureFrom).toHaveBeenCalledTimes(1);
  });

  it('清快取會把貼圖釋放掉，不是只丟掉參考', () => {
    const texture = getPawnTexture(look(), 'front') as unknown as { destroy: ReturnType<typeof vi.fn> };
    expect(pawnTextureCacheSize()).toBe(1);

    clearPawnTextureCache();

    expect(pawnTextureCacheSize()).toBe(0);
    expect(texture.destroy).toHaveBeenCalledWith(true);
  });

  it('清完之後重取會重新烘一張', () => {
    const a = getPawnTexture(look(), 'front');
    clearPawnTextureCache();
    const b = getPawnTexture(look(), 'front');
    expect(b).not.toBe(a);
  });

  it('取不到 2D context 時直接報錯，不回一張空貼圖', () => {
    getContextSpy.mockImplementation(() => null);
    expect(() => getPawnTexture(look(), 'front')).toThrow(/2D context/);
  });

  it('toPawnLook 帶出外觀的每一個欄位', () => {
    const appearance = createDefaultAppearance();
    const l = toPawnLook(appearance, '#123456');
    expect(l.hair).toBe(appearance.hair);
    expect(l.skin).toBe(appearance.skin);
    expect(l.hairColor).toBe(appearance.hairColor);
    expect(l.eyeColor).toBe(appearance.eyeColor);
    expect(l.lash).toEqual(appearance.lash);
    expect(l.cloth).toBe('#123456');
    /* cap 是算出來的，不是原封不動搬過來 */
    expect(l.cap.front).toBeTypeOf('number');
  });

  it('鍵是純字串，可以直接當 Map 的 key', () => {
    expect(pawnLookKey(look(), 'front')).toBeTypeOf('string');
  });
});
