import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WEAPON_ART, weaponTotalT, weaponPlaybackMs, type WeaponAttack } from '../weaponGeometry';

/**
 * 演出的時間行為 —— 什麼時候出現、什麼時候收乾淨、攻速高時壓縮多少。
 * 姿勢本身由 `weaponGeometry` 的純函式決定，這裡只驗 sprite 的生命週期。
 */
let textureSeq = 0;
vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  return { ...actual, Texture: { from: () => ({ id: ++textureSeq, destroy: vi.fn() }) } };
});

const { WeaponSprite } = await import('../WeaponSprite');
const { clearWeaponTextureCache } = await import('../weaponTexture');

function stubCtx(): CanvasRenderingContext2D {
  return new Proxy({} as CanvasRenderingContext2D, { get: () => () => {}, set: () => true });
}

let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clearWeaponTextureCache();
  spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => stubCtx() as unknown as null);
});
afterEach(() => spy.mockRestore());

const attack = (patch: Partial<WeaponAttack> = {}): WeaponAttack => ({
  type: 'sword' as const,
  material: 'iron' as const,
  aim: 90,
  attackIntervalMs: 1200,
  ...patch,
});

describe('武器演出的生命週期', () => {
  it('平常不畫，出手才出現', () => {
    const w = new WeaponSprite();
    expect(w.playing).toBe(false);
    w.play(attack());
    w.update(80);
    expect(w.playing).toBe(true);
  });

  it('演完自己收乾淨，不會停在最後一格', () => {
    const w = new WeaponSprite();
    w.play(attack());
    w.update(WEAPON_ART.sword.motion.durationMs * weaponTotalT(WEAPON_ART.sword.motion) + 1);
    expect(w.playing).toBe(false);
  });

  it('攻速堆滿時演出被壓縮，塞得進一次攻擊間隔', () => {
    const cfg = WEAPON_ART.twoHandAxe.motion;
    const play = weaponPlaybackMs(cfg, 300);
    expect(play * weaponTotalT(cfg)).toBeLessThanOrEqual(300);
    expect(play).toBeLessThan(cfg.durationMs);

    const w = new WeaponSprite();
    w.play(attack({ type: 'twoHandAxe', attackIntervalMs: 300 }));
    w.update(cfg.durationMs);
    expect(w.playing).toBe(false);
  });

  it('常速下維持設計時長，重量感才看得出來', () => {
    const cfg = WEAPON_ART.twoHandAxe.motion;
    expect(weaponPlaybackMs(cfg, 1200)).toBe(cfg.durationMs);
  });

  it('連續出手會從頭重播，不會接在上一次的中段', () => {
    const w = new WeaponSprite();
    w.play(attack());
    w.update(200);
    w.play(attack());
    w.update(1);
    expect(w.playing).toBe(true);
    w.update(WEAPON_ART.sword.motion.durationMs);
    expect(w.playing).toBe(false);
  });

  it('往上的三個方向畫在角色之下，其餘在上層', () => {
    const w = new WeaponSprite();
    for (const aim of [0, -63.4, 63.4, -45, 45]) {
      w.play(attack({ aim }));
      expect(w.behindPawn).toBe(true);
    }
    for (const aim of [180, -116.6, 116.6, -90, 90]) {
      w.play(attack({ aim }));
      expect(w.behindPawn).toBe(false);
    }
  });

  it('stop() 之後不再推進', () => {
    const w = new WeaponSprite();
    w.play(attack());
    w.stop();
    expect(w.playing).toBe(false);
    w.update(50);
    expect(w.playing).toBe(false);
  });
});

describe('投射物的出射點', () => {
  it('弓的箭從弓身上出去，不是從角色身上', async () => {
    const { weaponMuzzle, weaponGrip, WEAPON_ART: ART } = await import('../weaponGeometry');
    const bow = ART.bow;

    for (const aim of [0, 180, -90, 90]) {
      const muzzle = weaponMuzzle(bow, aim);
      const grip = weaponGrip(bow.geom, aim);
      /* 弓被推到面朝那一格，出射點要跟著過去 —— 停在握點就是從身上射 */
      const moved = Math.hypot(muzzle.x - grip.x, muzzle.y - grip.y);
      expect(moved).toBeGreaterThan(bow.geom.swingDown * 0.5);
    }
  });

  it('出射點跟著揮擊方向走，四個方向不會落在同一點', async () => {
    const { weaponMuzzle, WEAPON_ART: ART } = await import('../weaponGeometry');
    const seen = new Set(
      [0, 180, -90, 90].map((a) => {
        const m = weaponMuzzle(ART.bow, a);
        return `${m.x.toFixed(2)},${m.y.toFixed(2)}`;
      }),
    );
    expect(seen.size).toBe(4);
  });

  it('法杖從頂端的寶珠出去，比握點高一截', async () => {
    const { weaponMuzzle, weaponGrip, WEAPON_ART: ART } = await import('../weaponGeometry');
    const params = ART.staff.params;
    expect(params.shape).toBe('staff');
    if (params.shape !== 'staff') return;

    const muzzle = weaponMuzzle(ART.staff, 90);
    const grip = weaponGrip(ART.staff.geom, 90);
    expect(muzzle.y).toBeLessThan(grip.y - params.shaftLen * 0.5);
  });
});

describe('揮擊角度換算', () => {
  /** 螢幕角度：0 = 上、90 = 右、180 = 下、−90 = 左 */
  it.each([
    ['世界 +x（螢幕右下）', 1, 0, 116.57],
    ['世界 +y（螢幕左下）', 0, 1, -116.57],
    ['世界 −x（螢幕左上）', -1, 0, -63.43],
    ['世界 −y（螢幕右上）', 0, -1, 63.43],
    ['世界 (+1,+1)（螢幕正下）', 1, 1, 180],
    ['世界 (−1,−1)（螢幕正上）', -1, -1, 0],
    ['世界 (+1,−1)（螢幕正右）', 1, -1, 90],
    ['世界 (−1,+1)（螢幕正左）', -1, 1, -90],
  ])('%s', async (_label, dx, dy, expected) => {
    const { weaponAimFromDelta } = await import('../weaponGeometry');
    expect(weaponAimFromDelta(dx, dy)).toBeCloseTo(expected, 1);
  });

  it('原地不動回 null，不會亂猜一個角度', async () => {
    const { weaponAimFromDelta } = await import('../weaponGeometry');
    expect(weaponAimFromDelta(0, 0)).toBeNull();
  });

  it('往螢幕下方攻擊時角色面向鏡頭，不是背對', async () => {
    const { weaponAimFromDelta, pawnFacingForAim } = await import('../weaponGeometry');
    /* 怪在右下（世界 +x）—— 螢幕角度 116.6，偏水平所以是側身向右 */
    expect(pawnFacingForAim(weaponAimFromDelta(1, 0)!)).toBe('right');
    /* 怪在正下方 */
    expect(pawnFacingForAim(weaponAimFromDelta(1, 1)!)).toBe('front');
    /* 怪在正上方 */
    expect(pawnFacingForAim(weaponAimFromDelta(-1, -1)!)).toBe('back');
  });

  it('往下攻擊的武器畫在角色之上，往上才在之下', async () => {
    const { weaponAimFromDelta, weaponAxis } = await import('../weaponGeometry');
    expect(weaponAxis(weaponAimFromDelta(1, 0)!).behind).toBe(false);
    expect(weaponAxis(weaponAimFromDelta(-1, -1)!).behind).toBe(true);
  });
});
