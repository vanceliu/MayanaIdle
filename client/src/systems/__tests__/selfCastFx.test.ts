/**
 * 常駐腳本 → 演出的橋（`48-vfx.md` § 48.8.5）。
 *
 * 這條路曾經整段不存在：常駐腳本直接在 `gameStore` 裡施放 buff，
 * 完全沒有經過 ARPG 事件管線，所以設在常駐腳本上的 buff
 * **一個特效都不會演**（而玩家的 buff 幾乎都設在那裡）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { clearSelfCastFx, drainSelfCastFx, pushSelfCastFx } from '../selfCastFx';

describe('selfCastFx 佇列', () => {
  beforeEach(() => clearSelfCastFx());

  it('沒東西時取出空陣列', () => {
    expect(drainSelfCastFx()).toEqual([]);
  });

  it('取走之後就清空 —— 同一個 buff 不會每幀重演', () => {
    pushSelfCastFx({ skillId: 'protect-shield', healed: 0 });
    expect(drainSelfCastFx()).toEqual([{ skillId: 'protect-shield', healed: 0 }]);
    expect(drainSelfCastFx()).toEqual([]);
  });

  it('同一幀放好幾個 buff 都留得住，順序照施放', () => {
    pushSelfCastFx({ skillId: 'protect-shield', healed: 0 });
    pushSelfCastFx({ skillId: 'haste', healed: 0 });
    expect(drainSelfCastFx().map(e => e.skillId)).toEqual(['protect-shield', 'haste']);
  });

  it('治癒帶回血量，buff 一律 0', () => {
    pushSelfCastFx({ skillId: 'heal', healed: 35 });
    expect(drainSelfCastFx()[0].healed).toBe(35);
  });

  it('沒有人取的時候不會無限長大 —— 滿了丟最舊的', () => {
    /* 常駐迴圈每 300ms 跑一次，渲染端沒掛載時沒有人 drain */
    for (let i = 0; i < 100; i++) pushSelfCastFx({ skillId: `s${i}`, healed: 0 });
    const drained = drainSelfCastFx();
    expect(drained.length).toBeLessThanOrEqual(8);
    /* 留下的是最後那幾個，不是最早那幾個 */
    expect(drained[drained.length - 1].skillId).toBe('s99');
  });

  it('換地圖時丟掉還沒演的 —— 那是上一場的事', () => {
    pushSelfCastFx({ skillId: 'protect-shield', healed: 0 });
    clearSelfCastFx();
    expect(drainSelfCastFx()).toEqual([]);
  });
});
