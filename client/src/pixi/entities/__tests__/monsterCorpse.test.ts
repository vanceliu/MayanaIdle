/**
 * 屍體要活到打死牠的那一發落地為止（`48-vfx.md` § 48.7.6）。
 *
 * **判定與演出是兩條時間線。** 怪在判定的那一刻就從 store 消失，
 * 但那一發常常還在空中（起手 ＋ 飛行三、四百毫秒）。
 * 這裡釘的就是那段等待 —— 沒有它，秒殺時白閃與抖動一次都不會發生，
 * 而且投射物會打在一個已經淡光的位置上。
 */
import { describe, it, expect } from 'vitest';
import { HIT_REACTION_ART } from '../../ui/skillFx';
import { MonsterEntity } from '../MonsterEntity';

/** 一幀。與實際 ticker 的粒度一致 */
const FRAME = 16;

/** 怪已經從 store 拿掉了，每幀對一次帳（`syncMonsters` 的死亡分支） */
function tick(m: MonsterEntity, ms: number): void {
  for (let t = 0; t < ms; t += FRAME) {
    m.retire(FRAME);
    m.update(FRAME);
  }
}

describe('屍體的等待', () => {
  it('沒有特效在飛就立刻開始淡（DoT 打死的情況）', () => {
    const m = new MonsterEntity('m1');
    tick(m, HIT_REACTION_ART.deathFadeMs + FRAME * 2);
    expect(m.faded).toBe(true);
    m.destroy();
  });

  it('特效還在飛就不淡 —— 投射物不該打在已經消失的位置上', () => {
    const m = new MonsterEntity('m1');
    m.reserveHit();

    /* 飛行三百毫秒，遠超過淡出全長 */
    tick(m, 300);
    expect(m.faded).toBe(false);

    m.destroy();
  });

  it('落地之後才開始淡，而且那一下的白閃還來得及演', () => {
    const m = new MonsterEntity('m1');
    m.reserveHit();
    tick(m, 300);

    /* 那一發到了：先彈＋閃，再放行 */
    m.hit(1, 0);
    m.releaseHit();
    m.update(FRAME);
    expect(m.flashAlpha).toBeGreaterThan(0);

    expect(m.faded).toBe(false);
    tick(m, HIT_REACTION_ART.deathFadeMs + FRAME * 2);
    expect(m.faded).toBe(true);
    m.destroy();
  });

  it('保險絲：特效被池子擠掉、onLand 永遠不來，屍體還是會消失', () => {
    const m = new MonsterEntity('m1');
    m.reserveHit();

    tick(m, HIT_REACTION_ART.corpseGraceMs + HIT_REACTION_ART.deathFadeMs + FRAME * 4);
    expect(m.faded).toBe(true);
    m.destroy();
  });

  it('多發同時在飛，要等最後一發', () => {
    const m = new MonsterEntity('m1');
    m.reserveHit();
    m.reserveHit();

    m.releaseHit();
    tick(m, 300);
    expect(m.faded).toBe(false);

    m.releaseHit();
    tick(m, HIT_REACTION_ART.deathFadeMs + FRAME * 2);
    expect(m.faded).toBe(true);
    m.destroy();
  });
});

describe('血條跟著演出走', () => {
  it('投射物還在空中時血條不動，落地才扣', () => {
    const m = new MonsterEntity('m1');
    m.updateHp(100, 100);

    // 判定已經扣完血，但那一發還在飛
    m.reserveHit(40);
    m.updateHp(60, 100);
    expect(m.hpRatio).toBe(1);

    m.releaseHit(40);
    m.updateHp(60, 100);
    expect(m.hpRatio).toBeCloseTo(0.6);
    m.destroy();
  });

  it('多段技能一發一發扣，不是一次扣完', () => {
    const m = new MonsterEntity('m1');
    m.updateHp(100, 100);

    m.reserveHit(20);
    m.reserveHit(20);
    m.updateHp(60, 100);
    expect(m.hpRatio).toBe(1);

    m.releaseHit(20);
    m.updateHp(60, 100);
    expect(m.hpRatio).toBeCloseTo(0.8);

    m.releaseHit(20);
    m.updateHp(60, 100);
    expect(m.hpRatio).toBeCloseTo(0.6);
    m.destroy();
  });
});
