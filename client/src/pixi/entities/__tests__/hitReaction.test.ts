/**
 * 受擊往後彈（`48-vfx.md` § 48.7.6）。
 *
 * 位移每幀重算後疊在基準位置上，**必須回到 0**（不可累加）。
 */
import { describe, it, expect } from 'vitest';
import { HIT_REACTION_ART, SKILL_FX_ART } from '../../ui/skillFx';
import { HitReaction } from '../hitReaction';

const LEN = SKILL_FX_ART.impact.hitShakeMs;

describe('HitReaction', () => {
  it('沒被打到就完全不動', () => {
    const r = new HitReaction();
    r.update(500);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(0);
  });

  it('被打到會往「遠離攻擊者」的方向彈，然後回到原位', () => {
    const r = new HitReaction();
    r.hit(1, 0);

    r.update(LEN / 2);
    expect(r.offsetX).toBeGreaterThan(0);
    expect(r.offsetY).toBe(0);

    r.update(LEN);
    expect(r.offsetX).toBe(0);
  });

  it('方向取單位向量 —— 遠的目標不會彈得比較遠', () => {
    const near = new HitReaction();
    const far = new HitReaction();
    near.hit(3, 4);
    far.hit(30, 40);
    near.update(LEN / 2);
    far.update(LEN / 2);
    expect(near.offsetX).toBeCloseTo(far.offsetX, 6);
    expect(near.offsetY).toBeCloseTo(far.offsetY, 6);
  });

  it('連續被打是重新開始，不是累加', () => {
    const r = new HitReaction();
    r.hit(1, 0);
    r.update(LEN / 2);
    const peak = r.offsetX;

    r.hit(1, 0);
    r.update(LEN / 2);
    /* 第二下疊上去的話這裡會是兩倍 */
    expect(r.offsetX).toBeCloseTo(peak, 6);
  });

  it('攻擊者與自己重疊時不彈 —— 沒有方向可言', () => {
    const r = new HitReaction();
    r.hit(0, 0);
    r.update(LEN / 2);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(0);
  });

  it('掉幀不會把它卡在半路 —— 一大步就結束', () => {
    const r = new HitReaction();
    r.hit(0, 1);
    r.update(LEN * 5);
    expect(r.offsetY).toBe(0);
  });
});

describe('受擊白閃（§ 48.7.6）', () => {
  it('沒被打到就不閃', () => {
    const r = new HitReaction();
    r.update(50);
    expect(r.flashAlpha).toBe(0);
  });

  it('快亮慢滅 —— 前半段掉得比後半段多', () => {
    /* 等速淡出讀起來是「發光」，不是「被打到」 */
    const at = (ms: number) => {
      const r = new HitReaction();
      r.hit(1, 0);
      r.update(ms);
      return r.flashAlpha;
    };
    const full = HIT_REACTION_ART.flashMs;
    expect(at(0) - at(full * 0.25)).toBeGreaterThan(at(full * 0.5) - at(full * 0.75));
  });

  it('閃比彈短 —— 兩者分開計時', () => {
    const r = new HitReaction();
    r.hit(1, 0);
    r.update(HIT_REACTION_ART.flashMs + 1);
    expect(r.flashAlpha).toBe(0);
    /* 抖動還在演 */
    expect(r.offsetX).toBeGreaterThan(0);
  });
});

describe('死亡淡出（§ 48.7.6）', () => {
  it('活著的時候是全不透明、不下沉', () => {
    const r = new HitReaction();
    r.update(1000);
    expect(r.alpha).toBe(1);
    expect(r.offsetY).toBe(0);
    expect(r.faded).toBe(false);
  });

  it('先撐一下才開始淡 —— 血條要先被看到歸零，爆點也不該打在殘影上', () => {
    const r = new HitReaction();
    r.die();
    /* 撐的區間內還是全不透明 */
    r.update(HIT_REACTION_ART.deathFadeMs * HIT_REACTION_ART.deathHoldRatio * 0.5);
    expect(r.alpha).toBe(1);
  });

  it('撐的是透明度，不是整個動作 —— 下沉第一幀就開始', () => {
    const r = new HitReaction();
    r.die();
    r.update(HIT_REACTION_ART.deathFadeMs * HIT_REACTION_ART.deathHoldRatio * 0.5);
    expect(r.alpha).toBe(1);
    expect(r.offsetY).toBeGreaterThan(0);
  });

  it('淡到透明並往下沉，然後回報演完了', () => {
    const r = new HitReaction();
    r.die();
    r.update(HIT_REACTION_ART.deathFadeMs / 2);
    expect(r.alpha).toBeLessThan(1);
    expect(r.offsetY).toBeGreaterThan(0);

    r.update(HIT_REACTION_ART.deathFadeMs);
    expect(r.alpha).toBe(0);
    expect(r.faded).toBe(true);
  });

  it('重複宣告死亡不會把它拉回全不透明', () => {
    const r = new HitReaction();
    r.die();
    r.update(HIT_REACTION_ART.deathFadeMs * 0.8);
    const mid = r.alpha;
    r.die();
    expect(r.alpha).toBe(mid);
  });

  it('reset 之後回到全新狀態（調校頁重播）', () => {
    const r = new HitReaction();
    r.hit(1, 0);
    r.die();
    r.update(HIT_REACTION_ART.deathFadeMs * 2);
    expect(r.faded).toBe(true);

    r.reset();
    expect(r.faded).toBe(false);
    expect(r.alpha).toBe(1);
    expect(r.offsetX).toBe(0);
    expect(r.offsetY).toBe(0);
  });
});
