/**
 * 最大 HP／MP 公式（`20-attributes.md` § 20.4、§ 20.5）。
 */
import { describe, it, expect } from 'vitest';
import { getMaxHp, getMaxMp } from '../maxHpMp';
import type { Character, ClassName } from '../../models/character';
import { CLASS_BASE_ATTRIBUTES } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';

const zero = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
function char(className: ClassName, level: number, extra: Partial<Character> = {}): Character {
  return {
    name: 'T', className, level, exp: 0, expToNext: 100, hp: 1, mp: 1,
    baseAttributes: { ...CLASS_BASE_ATTRIBUTES[className] }, bonusAttributes: { ...zero },
    gold: 0, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1, ...extra,
  };
}

describe('最大 HP／MP', () => {
  it('Lv1 全職業為 30／10 附近（加成由 Lv1＝30／10 反推）', () => {
    expect(getMaxHp(char('knight', 1), [])).toBe(30);     // floor(16×0.7)=11 + 19
    expect(getMaxMp(char('knight', 1), [])).toBe(10);     // 10×0.4=4 + 6
    expect(getMaxHp(char('elementalist', 1), [])).toBe(30); // 10×0.4=4 + 26
    expect(getMaxMp(char('elementalist', 1), [])).toBe(9);  // floor(14×0.7)=9 + 0
  });

  it('等級 × 屬性 × 比值 ＋ 加成', () => {
    expect(getMaxHp(char('knight', 75), [])).toBe(859);  // floor(75×16×0.7)=840 + 19
    expect(getMaxMp(char('priest', 75), [])).toBe(632);  // floor(75×12×0.7)=630 + 2
  });

  it('裝備的體質與固定 HP 計入', () => {
    const ring = { bonusAttributes: { VIT: 4 }, bonusHp: 20, affixes: [] } as unknown as EquipmentInstance;
    // floor(10×20×0.7)=140 + 19 + 20
    expect(getMaxHp(char('knight', 10), [ring])).toBe(179);
  });

  it('星盤屬性計入，最大 HP% 乘在最後', () => {
    // 騎士起點 +2 力量 +2 體質；堅忍之星 HP +12%（需路徑，這裡只驗加總）
    const c = char('knight', 50, { starChart: ['knight-start', 'center-240-k'] });
    // 體質 18：floor(50×18×0.7)=630 + 19 = 649；×1.12 → 726
    expect(getMaxHp(c, [])).toBe(726);
  });

  it('起點以外的體質、精神也是屬性，照公式計入', () => {
    // 巨岩座：體質 +2、最大 HP +2%、最大 MP +2%；起點體質 +2
    const knight = char('knight', 50, { starChart: ['knight-start', 'knight-side1-s'] });
    // 體質 20：floor(50×20×0.7)=700 + 19 = 719；×1.02 → 733
    expect(getMaxHp(knight, [])).toBe(733);
    // 星泉座：精神 +2、最大 HP +2%、最大 MP +2%；起點精神 +2
    const ele = char('elementalist', 50, { starChart: ['elementalist-start', 'elementalist-side1-s'] });
    // 精神 18：floor(50×18×0.7)=630 + 0 = 630；×1.02 → 642
    expect(getMaxMp(ele, [])).toBe(642);
  });
});
