import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BoundsContext } from './boundsContext';
import { drawWeapon } from '../drawWeapon';
import {
  WEAPON_ART, PAWN_WEAPON_TYPES, WEAPON_MATERIAL_COLOR, weaponColors,
} from '../weaponGeometry';

/**
 * 烘焙與快取。
 *
 * jsdom 沒有 canvas，所以把 `getContext('2d')` 換成什麼都不做的假 ctx，
 * 並把 `Texture.from()` 換成會回傳可辨識物件的假的 —— 這樣才驗得出
 * 「同組合不重烘」「無關的欄位不該讓它重烘」。
 * 形狀本身由下面的外框測試負責。
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
  getWeaponTexture, weaponTextureKey, weaponUsesLead, weaponUsesPull, quantizePull,
  clearWeaponTextureCache, weaponTextureCacheSize,
  WEAPON_TEX_W, WEAPON_TEX_H, WEAPON_ANCHOR_X, WEAPON_ANCHOR_Y,
  WEAPON_BAKE_SCALE, WEAPON_PULL_STEPS,
} = await import('../weaponTexture');

function stubCtx(): CanvasRenderingContext2D {
  return new Proxy({} as CanvasRenderingContext2D, {
    get: () => () => {},
    set: () => true,
  });
}

let getContextSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearWeaponTextureCache();
  textureFrom.mockClear();
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => stubCtx() as unknown as null);
});

afterEach(() => {
  getContextSpy.mockRestore();
});

describe('武器貼圖快取', () => {
  it('同一組只烘一次', () => {
    getWeaponTexture('sword', 'iron');
    getWeaponTexture('sword', 'iron');
    expect(weaponTextureCacheSize()).toBe(1);
    expect(textureFrom).toHaveBeenCalledTimes(1);
  });

  it('換材質要重烘', () => {
    getWeaponTexture('sword', 'iron');
    getWeaponTexture('sword', 'mithril');
    expect(weaponTextureCacheSize()).toBe(2);
  });

  it('對稱的武器不因刃口側而重烘', () => {
    getWeaponTexture('sword', 'iron', 1);
    getWeaponTexture('sword', 'iron', -1);
    expect(weaponTextureCacheSize()).toBe(1);
  });

  it('單刃斧與鋼爪要分刃口側', () => {
    getWeaponTexture('axe', 'iron', 1);
    getWeaponTexture('axe', 'iron', -1);
    getWeaponTexture('claw', 'iron', 1);
    getWeaponTexture('claw', 'iron', -1);
    expect(weaponTextureCacheSize()).toBe(4);
  });

  it('雙刃斧兩側都有刃，不分刃口側', () => {
    expect(weaponUsesLead(WEAPON_ART.twoHandAxe.params)).toBe(false);
    getWeaponTexture('twoHandAxe', 'iron', 1);
    getWeaponTexture('twoHandAxe', 'iron', -1);
    expect(weaponTextureCacheSize()).toBe(1);
  });

  it('只有弓吃拉弦量，其餘武器換 pull 不重烘', () => {
    getWeaponTexture('sword', 'iron', 1, 0);
    getWeaponTexture('sword', 'iron', 1, 1);
    expect(weaponTextureCacheSize()).toBe(1);

    clearWeaponTextureCache();
    getWeaponTexture('bow', 'iron', 1, 0);
    getWeaponTexture('bow', 'iron', 1, 1);
    expect(weaponTextureCacheSize()).toBe(2);
  });

  it('拉弦量最多量化成 WEAPON_PULL_STEPS 段', () => {
    for (let i = 0; i <= 40; i++) getWeaponTexture('bow', 'iron', 1, i / 40);
    expect(weaponTextureCacheSize()).toBe(WEAPON_PULL_STEPS);
  });

  it('快取鍵涵蓋每一個會影響畫面的欄位', () => {
    const base = weaponTextureKey('axe', 'iron', 1, 0);
    expect(weaponTextureKey('mace', 'iron', 1, 0)).not.toBe(base);
    expect(weaponTextureKey('axe', 'dragon', 1, 0)).not.toBe(base);
    expect(weaponTextureKey('axe', 'iron', -1, 0)).not.toBe(base);
    expect(weaponUsesPull(WEAPON_ART.bow.params)).toBe(true);
  });

  it('沒有材質時退回預設色，不會拿到別的材質的貼圖', () => {
    getWeaponTexture('sword', null);
    getWeaponTexture('sword', 'iron');
    expect(weaponTextureCacheSize()).toBe(2);
  });
});

describe('貼圖尺寸容得下所有武器', () => {
  /** 貼圖裡可用的範圍，相對握點 */
  const LEFT = -WEAPON_ANCHOR_X;
  const RIGHT = WEAPON_TEX_W - WEAPON_ANCHOR_X;
  const TOP = -WEAPON_ANCHOR_Y;
  const BOTTOM = WEAPON_TEX_H - WEAPON_ANCHOR_Y;

  it.each(PAWN_WEAPON_TYPES)('%s 的每個狀態都畫得進貼圖', (type) => {
    const art = WEAPON_ART[type];
    for (const material of Object.keys(WEAPON_MATERIAL_COLOR) as (keyof typeof WEAPON_MATERIAL_COLOR)[]) {
      for (const lead of [1, -1] as const) {
        for (let i = 0; i < WEAPON_PULL_STEPS; i++) {
          const ctx = new BoundsContext();
          drawWeapon(
            ctx, 0, 0, art.params, weaponColors(material), art.geom,
            quantizePull(i / (WEAPON_PULL_STEPS - 1)), lead,
          );
          expect(ctx.badValues).toEqual([]);
          expect(ctx.left).toBeGreaterThan(LEFT);
          expect(ctx.right).toBeLessThan(RIGHT);
          expect(ctx.top).toBeGreaterThan(TOP);
          expect(ctx.bottom).toBeLessThan(BOTTOM);
        }
      }
    }
  });

  it('超取樣倍率不是 1，鏡頭拉近才不會糊', () => {
    expect(WEAPON_BAKE_SCALE).toBeGreaterThan(1);
  });
});
