/**
 * 場上狀態特效的每幀對帳（`48-vfx.md` § 48.8.2、§ 48.8.3）。
 *
 * 這裡跑真的 `SkillFxManager`，所以「每幀重放會不會疊出六十顆星星」
 * 是用 `activeCount` 量出來的，不是用讀的。
 */
import { describe, it, expect } from 'vitest';
import { SkillFxManager } from '../SkillFxManager';
import { DEBUFF_TINT } from '../geometry';
import {
  STUN_TAG, StatusMarkTracker, resolveStatusMark, resolveStatusTint,
} from '../statusFx';

describe('resolveStatusMark', () => {
  it('只有暈眩有標記', () => {
    expect(resolveStatusMark([STUN_TAG])).toBe('stun');
    expect(resolveStatusMark(['poisoned', 'slowed', 'bleeding'])).toBeNull();
    expect(resolveStatusMark([])).toBeNull();
  });
});

describe('resolveStatusTint', () => {
  it('沒有 debuff 就不染', () => {
    expect(resolveStatusTint([])).toBeNull();
  });

  it('多個同時掛著時取優先度最高的，不混色', () => {
    /* 混出來的顏色沒有語意（§ 48.8.2） */
    const tint = resolveStatusTint(['slowed', 'bleeding', 'poisoned']);
    expect(tint).toBe(DEBUFF_TINT.bleeding);
  });

  it('暈眩不染色 —— 它已經有頭頂星星了', () => {
    expect(resolveStatusTint([STUN_TAG])).toBeNull();
  });
});

describe('StatusMarkTracker', () => {
  const stunned = (key: string, x = 0, y = 0) => ({ key, x, y, tags: [STUN_TAG] });

  it('每幀重放也只有一顆星星', () => {
    const fx = new SkillFxManager();
    const t = new StatusMarkTracker();
    for (let i = 0; i < 60; i++) {
      t.sync(fx, [stunned('m1')]);
      fx.update(16);
    }
    expect(fx.activeCount).toBe(1);
    fx.destroy();
  });

  it('標記跟著目標走 —— 怪會移動', () => {
    const fx = new SkillFxManager();
    const t = new StatusMarkTracker();
    t.sync(fx, [stunned('m1', 10, 20)]);
    t.sync(fx, [stunned('m1', 90, 40)]);

    const g = fx.container.children[0];
    expect({ x: g.x, y: g.y }).toEqual({ x: 90, y: 40 });
    fx.destroy();
  });

  it('暈眩結束就收掉', () => {
    const fx = new SkillFxManager();
    const t = new StatusMarkTracker();
    t.sync(fx, [stunned('m1')]);
    expect(fx.activeCount).toBe(1);

    t.sync(fx, [{ key: 'm1', x: 0, y: 0, tags: ['poisoned'] }]);
    expect(fx.activeCount).toBe(0);
    fx.destroy();
  });

  it('目標整個消失（怪死了）也要收掉，不靠呼叫端記得', () => {
    const fx = new SkillFxManager();
    const t = new StatusMarkTracker();
    t.sync(fx, [stunned('m1'), stunned('m2')]);
    expect(fx.activeCount).toBe(2);

    t.sync(fx, [stunned('m2')]);
    expect(fx.activeCount).toBe(1);
    fx.destroy();
  });

  it('clear 之後重新開始 —— 不會以為星星還在而只 move 不 spawn', () => {
    const fx = new SkillFxManager();
    const t = new StatusMarkTracker();
    t.sync(fx, [stunned('m1')]);

    /* 換地圖：特效層被清空，追蹤表也要跟著忘掉 */
    fx.clear();
    t.clear(fx);
    t.sync(fx, [stunned('m1')]);

    expect(fx.activeCount).toBe(1);
    fx.destroy();
  });
});
