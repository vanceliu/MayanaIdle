import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * 出手時的朝向。
 *
 * 這裡驗的是**朝向撐多久**：演出期間一律面對攻擊方向，
 * 只有演完才把朝向還給移動方向。只撐一幀的話，
 * 邊走邊打會變成「往左走、卻在右邊揮刀」。
 */
let textureSeq = 0;
vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  return { ...actual, Texture: { from: () => ({ id: ++textureSeq, destroy: vi.fn() }) } };
});

const { PawnSprite } = await import('../PawnSprite');
const { WEAPON_ART, weaponTotalT, weaponAimFromDelta } = await import('../weaponGeometry');
const { clearWeaponTextureCache } = await import('../weaponTexture');
const { clearPawnTextureCache } = await import('../pawnTexture');
const { HAIR_RENDER } = await import('../hairRender');

function stubCtx(): CanvasRenderingContext2D {
  return new Proxy({} as CanvasRenderingContext2D, { get: () => () => {}, set: () => true });
}

let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clearWeaponTextureCache();
  clearPawnTextureCache();
  spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => stubCtx() as unknown as null);
});
afterEach(() => spy.mockRestore());

const look = () => ({
  hair: 'bald' as const,
  skin: '#e8c9a0',
  hairColor: '#4a3728',
  eyeColor: '#24506e',
  cloth: '#3d7fb8',
  lash: { on: 0 as const, len: 14, curl: 9, w: 45 },
  cap: HAIR_RENDER.bald.capCfg,
});

/** 玩家在 (5,5)，怪在世界 +x−y 方向 → 螢幕正右 */
const AIM_RIGHT = weaponAimFromDelta(1, -1)!;

describe('出手時的朝向', () => {
  it('演出期間一路面對攻擊方向，即使往反方向走', () => {
    const pawn = new PawnSprite(look(), 0x4dabf7);
    const sword = WEAPON_ART.sword;

    pawn.attack({ type: 'sword', material: 'iron', aim: AIM_RIGHT, attackIntervalMs: 1200 });

    /* 一路往螢幕左邊走（世界 −x+y） */
    let x = 5;
    let y = 5;
    for (let ms = 0; ms < sword.motion.durationMs * 0.9; ms += 16) {
      pawn.update(16);
      x -= 0.05;
      y += 0.05;
      pawn.updateFacingFrom(x, y);
      expect(pawn.currentFacing).toBe('right');
    }
  });

  it('演出結束後朝向還給移動方向', () => {
    const pawn = new PawnSprite(look(), 0x4dabf7);
    const sword = WEAPON_ART.sword;
    const total = sword.motion.durationMs * weaponTotalT(sword.motion);

    pawn.attack({ type: 'sword', material: 'iron', aim: AIM_RIGHT, attackIntervalMs: 1200 });
    pawn.updateFacingFrom(5, 5);

    pawn.update(total + 32);
    pawn.updateFacingFrom(4.5, 5.5); // 往螢幕左走
    expect(pawn.currentFacing).toBe('left');
  });

  it('演出中再次出手，朝向立刻換到新的目標', () => {
    const pawn = new PawnSprite(look(), 0x4dabf7);

    pawn.attack({ type: 'sword', material: 'iron', aim: AIM_RIGHT, attackIntervalMs: 1200 });
    pawn.update(100);
    pawn.updateFacingFrom(5, 5);
    expect(pawn.currentFacing).toBe('right');

    const aimLeft = weaponAimFromDelta(-1, 1)!;
    pawn.attack({ type: 'sword', material: 'iron', aim: aimLeft, attackIntervalMs: 1200 });
    pawn.update(16);
    pawn.updateFacingFrom(5, 5);
    expect(pawn.currentFacing).toBe('left');
  });
});
