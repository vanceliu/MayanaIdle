import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Texture } from 'pixi.js';
import { createDefaultAppearance } from '../../../../models/appearance';
import type { PawnDirectionId } from '../geometry';

/**
 * 只把「烘貼圖」換掉 —— jsdom 沒有 canvas，烘不出東西。
 * 其餘（PawnSprite 本身、朝向的取捨）一律用真的，
 * 否則測到的是測試裡複製的一份邏輯，改壞了也不會紅。
 */
const getPawnTexture = vi.fn((_look: unknown, dir: PawnDirectionId) => {
  void dir;
  return Texture.EMPTY;
});

vi.mock('../pawnTexture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../pawnTexture')>();
  return { ...actual, getPawnTexture: (look: unknown, dir: PawnDirectionId) => getPawnTexture(look, dir) };
});

const { PawnSprite } = await import('../PawnSprite');
const { toPawnLook } = await import('../pawnTexture');

const LOOK = toPawnLook(createDefaultAppearance(), '#8fa3c4');

/** 目前貼圖用的是哪個朝向 —— 直接看最後一次要貼圖時問的方向 */
function facingOf(): PawnDirectionId {
  return getPawnTexture.mock.calls[getPawnTexture.mock.calls.length - 1][1];
}

function makeSprite() {
  const sprite = new PawnSprite(LOOK, 0x4dabf7);
  return sprite;
}

/**
 * 攻擊方向與角色朝向必須一致 —— 往左射箭卻面向右，看起來就是背對著射。
 *
 * 螢幕方向 ↔ 世界座標：正左 = (−1, +1)、正右 = (+1, −1)、
 * 正下 = (+1, +1)、正上 = (−1, −1)（等距投影，見 `facing.ts`）。
 */
describe('朝向的取捨（攻擊 vs 移動）', () => {
  beforeEach(() => getPawnTexture.mockClear());

  it('站著不動時打左邊的目標 → 面向左', () => {
    const p = makeSprite();
    p.updateFacingFrom(10, 10);
    p.faceToward(10, 10, 9, 11);
    p.updateFacingFrom(10, 10);
    expect(facingOf()).toBe('left');
  });

  it('站著不動時打右邊的目標 → 面向右', () => {
    const p = makeSprite();
    p.updateFacingFrom(10, 10);
    p.faceToward(10, 10, 11, 9);
    p.updateFacingFrom(10, 10);
    expect(facingOf()).toBe('right');
  });

  /**
   * 同一幀內移動與出手都發生時，攻擊要贏。
   * 主迴圈的順序是「移動 → 戰鬥 → 更新畫面」，位移更新跑在最後 ——
   * 讓移動贏的話，射擊那一瞬間會朝著走的方向而不是目標。
   */
  it('邊往右走邊打左邊的目標 → 面向左（攻擊壓過移動）', () => {
    const p = makeSprite();
    p.updateFacingFrom(10, 10);
    p.faceToward(11, 9, 9, 11); // 戰鬥迴圈：目標在螢幕左方 —— 故意跟移動方向相反
    p.updateFacingFrom(11, 9);  // 同一幀稍後：位移是螢幕往右
    expect(facingOf()).toBe('left');
  });

  it('沒出手時就照移動方向', () => {
    const p = makeSprite();
    p.updateFacingFrom(10, 10);
    p.updateFacingFrom(11, 9);
    expect(facingOf()).toBe('right');
  });

  it('攻擊朝向只作用一幀，下一幀恢復由移動決定', () => {
    const p = makeSprite();
    p.updateFacingFrom(10, 10);
    p.faceToward(10, 10, 9, 11);
    p.updateFacingFrom(10, 10);
    expect(facingOf()).toBe('left');

    p.updateFacingFrom(11, 9);
    expect(facingOf()).toBe('right');
  });

  it('攻擊完站著不動 → 維持面向目標，不會轉回去', () => {
    const p = makeSprite();
    p.updateFacingFrom(10, 10);
    p.faceToward(10, 10, 9, 11);
    p.updateFacingFrom(10, 10);
    expect(facingOf()).toBe('left');

    getPawnTexture.mockClear();
    for (let i = 0; i < 10; i++) p.updateFacingFrom(10, 10);
    /* 朝向沒變就不該重新取貼圖 —— 每幀換 texture 是白費工 */
    expect(getPawnTexture).not.toHaveBeenCalled();
  });

  it('目標就在腳下（位移為 0）不會亂轉', () => {
    const p = makeSprite();
    p.updateFacingFrom(10, 10);
    p.faceToward(10, 10, 11, 9);
    p.updateFacingFrom(10, 10);
    expect(facingOf()).toBe('right');

    getPawnTexture.mockClear();
    p.faceToward(10, 10, 10, 10); // 同一格
    p.updateFacingFrom(10, 10);
    expect(getPawnTexture).not.toHaveBeenCalled();
  });

  it('打正下方 / 正上方的目標 → 正面 / 背面', () => {
    const p = makeSprite();
    p.updateFacingFrom(10, 10);
    p.faceToward(10, 10, 11, 11);
    p.updateFacingFrom(10, 10);
    expect(facingOf()).toBe('front');

    p.faceToward(10, 10, 9, 9);
    p.updateFacingFrom(10, 10);
    expect(facingOf()).toBe('back');
  });
});
