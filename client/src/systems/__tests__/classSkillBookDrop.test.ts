import { describe, it, expect } from 'vitest';
import { rollClassSkillBookDrop } from '../classSkillBookDrop';

describe('classSkillBookDrop', () => {
  it('returns null for areas below level 40', () => {
    for (let i = 0; i < 100; i++) {
      expect(rollClassSkillBookDrop(39, false)).toBeNull();
    }
  });

  it('can drop level 3 book in Lv40~42 area', () => {
    const level3Books = [
      '鋼鐵護盾技能書', '三連射技能書', '元素增幅技能書', '群體治癒技能書', '煙霧彈技能書',
    ];
    let dropped = false;
    for (let i = 0; i < 100000; i++) {
      const result = rollClassSkillBookDrop(42, false);
      if (result) {
        expect(level3Books).toContain(result);
        dropped = true;
        break;
      }
    }
    expect(dropped).toBe(true);
  });

  it('can drop level 4 book in Lv43~45 area', () => {
    const level4Books = [
      '挑釁怒吼技能書', '鷹眼技能書', '連鎖詠唱技能書', '復活術技能書', '精準打擊技能書',
    ];
    let dropped = false;
    for (let i = 0; i < 100000; i++) {
      const result = rollClassSkillBookDrop(44, false);
      if (result) {
        expect(level4Books).toContain(result);
        dropped = true;
        break;
      }
    }
    expect(dropped).toBe(true);
  });

  it('can drop level 5 book in Lv46+ area', () => {
    const level5Books = [
      '復仇之刃技能書', '穿透箭雨技能書', '元素風暴技能書', '神聖領域技能書', '背刺技能書',
    ];
    let dropped = false;
    for (let i = 0; i < 100000; i++) {
      const result = rollClassSkillBookDrop(48, false);
      if (result) {
        expect(level5Books).toContain(result);
        dropped = true;
        break;
      }
    }
    expect(dropped).toBe(true);
  });

  it('boss has much higher drop rate than normal monster', () => {
    let bossDrops = 0;
    let normalDrops = 0;
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      if (rollClassSkillBookDrop(45, true)) bossDrops++;
      if (rollClassSkillBookDrop(45, false)) normalDrops++;
    }

    expect(bossDrops).toBeGreaterThan(normalDrops * 10);
  });

  it('boss drop rate is approximately 5%', () => {
    let drops = 0;
    const iterations = 10000;
    for (let i = 0; i < iterations; i++) {
      if (rollClassSkillBookDrop(45, true)) drops++;
    }
    const rate = drops / iterations;
    expect(rate).toBeGreaterThan(0.03);
    expect(rate).toBeLessThan(0.07);
  });

  it('normal monster drop rate is approximately 0.05%', () => {
    let drops = 0;
    const iterations = 200000;
    for (let i = 0; i < iterations; i++) {
      if (rollClassSkillBookDrop(45, false)) drops++;
    }
    const rate = drops / iterations;
    expect(rate).toBeGreaterThan(0.0002);
    expect(rate).toBeLessThan(0.001);
  });
});
