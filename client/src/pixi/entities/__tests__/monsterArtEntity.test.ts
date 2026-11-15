/** 地圖上的怪物圖（`25-monster-system.md` § 25.2.2） */
import { Container, Sprite, Texture } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { outlinedArtLayout } from '../monster/artOutline';
import { monsterArtOverheadLift } from '../monster/monsterArt';
import type { MonsterArtImages } from '../monster/monsterArtAssets';
import { MonsterEntity, monsterTopLift } from '../MonsterEntity';

const textureCalls: { scale: number; color: string }[] = [];
vi.mock('../monster/monsterArtTextures', () => ({
  monsterArtTexture: (image: { width: number; height: number }, scale: number, color: string) => {
    textureCalls.push({ scale, color });
    return { texture: Texture.EMPTY, layout: outlinedArtLayout(image, scale, 1) };
  },
}));

const IMAGES = {
  front: { width: 60, height: 128 },
  side: { width: 80, height: 120 },
  back: { width: 60, height: 126 },
} as unknown as MonsterArtImages;

/** 哥布林之王（id 151）：Boss、有素材 */
const BOSS_TEMPLATE = 151;

async function withArt(entity: MonsterEntity, templateId = BOSS_TEMPLATE, affixes = 0): Promise<void> {
  entity.setArt(templateId, affixes, () => Promise.resolve(IMAGES));
  await Promise.resolve();
  await Promise.resolve();
}

const sprites = (m: MonsterEntity) => m.container.children.filter((c): c is Sprite => c instanceof Sprite);
const overhead = (m: MonsterEntity) => m.container.children[m.container.children.length - 1] as Container;

beforeEach(() => {
  textureCalls.length = 0;
});

describe('MonsterEntity 怪物圖', () => {
  it('有素材時藏起球體與 Boss 角，頭頂物件上移到怪物圖頂上方', async () => {
    const m = new MonsterEntity('b', true, 'large');
    await withArt(m);
    expect(m.hasArt).toBe(true);
    expect(sprites(m)).toHaveLength(2);
    const visible = m.container.children.filter(c => c.visible && !(c instanceof Sprite) && c !== overhead(m));
    expect(visible.length).toBe(1);
    expect(overhead(m).children.slice(0, 2).every(c => !c.visible)).toBe(true);
    expect(m.overheadLift).toBeCloseTo(monsterTopLift('large') + monsterArtOverheadLift('large'));
    expect(overhead(m).y).toBeCloseTo(-m.overheadLift);
    m.destroy();
  });

  it('沒有素材的模板維持球體，不載入', async () => {
    const m = new MonsterEntity('x', false, 'small');
    const load = vi.fn(() => Promise.resolve(IMAGES));
    m.setArt(-1, 0, load);
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    expect(m.hasArt).toBe(false);
    expect(m.overheadLift).toBe(monsterTopLift('small'));
    m.destroy();
  });

  it('外框色依強化詞綴數；同素材同顏色不重載', async () => {
    const m = new MonsterEntity('a', false, 'small');
    const load = vi.fn(() => Promise.resolve(IMAGES));
    m.setArt(BOSS_TEMPLATE, 2, load);
    m.setArt(BOSS_TEMPLATE, 2, load);
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    expect(textureCalls.at(-1)!.color).toBe('#FACC15');
    m.destroy();
  });

  it('朝向跟著移動方向：往左走用側面鏡像、往右走不鏡像', async () => {
    const m = new MonsterEntity('w', false, 'small');
    await withArt(m);
    m.updatePosition({ x: 5, y: 5 });
    m.updatePosition({ x: 4, y: 6 });
    const left = sprites(m)[0].scale.x;
    m.updatePosition({ x: 5, y: 5 });
    const right = sprites(m)[0].scale.x;
    expect(left).toBeLessThan(0);
    expect(right).toBeGreaterThan(0);
    m.destroy();
  });

  it('受擊白閃與狀態染色套在怪物圖上', async () => {
    const m = new MonsterEntity('h', false, 'small');
    await withArt(m);
    m.hit(1, 0);
    m.update(16);
    const [sprite, flashSprite] = sprites(m);
    expect(flashSprite.alpha).toBeGreaterThan(0);
    expect(flashSprite.alpha).toBe(m.flashAlpha);
    m.setTint(0x88ff88);
    expect(sprite.tint).toBe(0x88ff88);
    m.destroy();
  });

  it('載入完成前已銷毀就不套用', async () => {
    const m = new MonsterEntity('d', false, 'small');
    let resolve!: (images: MonsterArtImages) => void;
    m.setArt(BOSS_TEMPLATE, 0, () => new Promise(r => { resolve = r; }));
    m.destroy();
    resolve(IMAGES);
    await Promise.resolve();
    expect(m.hasArt).toBe(false);
  });
});

describe('MonsterEntity 畫面版本切換', () => {
  it('關掉怪物圖改畫球，打開立刻換回已載入的怪物圖', async () => {
    const m = new MonsterEntity('g', true, 'small');
    await withArt(m);
    m.setArtEnabled(false);
    expect(m.hasArt).toBe(false);
    expect(sprites(m).every(s => !s.visible)).toBe(true);
    expect(overhead(m).children.slice(0, 2).every(c => c.visible)).toBe(true);
    expect(overhead(m).y).toBeCloseTo(-monsterTopLift('small'));
    m.setArtEnabled(true);
    expect(m.hasArt).toBe(true);
    expect(sprites(m).every(s => s.visible)).toBe(true);
    expect(overhead(m).y).toBeCloseTo(-m.overheadLift);
    m.destroy();
  });

  it('關掉時不載入素材', () => {
    const m = new MonsterEntity('n', false, 'small');
    m.setArtEnabled(false);
    const load = vi.fn(() => Promise.resolve(IMAGES));
    m.setArt(BOSS_TEMPLATE, 0, load);
    expect(load).not.toHaveBeenCalled();
    m.destroy();
  });
});

describe('MonsterEntity 出手轉向', () => {
  it('攻擊時轉向被打的對象，之後沒移動就維持', async () => {
    const m = new MonsterEntity('f', false, 'small');
    await withArt(m);
    m.updatePosition({ x: 5, y: 5 });
    m.updatePosition({ x: 6, y: 4 });
    const before = sprites(m)[0].scale.x;
    m.faceToward({ x: 5, y: 5 });
    const after = sprites(m)[0].scale.x;
    expect(Math.sign(after)).toBe(-Math.sign(before));
    m.updatePosition({ x: 6, y: 4 });
    expect(sprites(m)[0].scale.x).toBe(after);
    m.destroy();
  });
});
