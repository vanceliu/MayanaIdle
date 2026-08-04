import { describe, it, expect } from 'vitest';
import { getEffectiveDefense, BASE_CHARACTER_DEFENSE } from '../combat';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';

/**
 * 角色初始防禦（`21-combat-formula.md` § 21.5）。
 *
 * 防禦值直接等於減傷百分比，所以這個負值等於全體減傷少 10 個百分點。
 * 兩個設計決定必須鎖住：
 *  1. 夾底於 0 —— 裸裝不會承受超過 100% 的傷害
 *  2. 最後才減 —— 防禦%詞綴不放大這個負值
 */

function armor(defense: number, affixes: EquipmentInstance['affixes'] = []): EquipmentInstance {
  return {
    templateId: 1, name: '測試甲', type: 'armor', slot: 'chest', isTwoHanded: false,
    defense, quality: 0, enhancement: 0, affixes, ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

const curse: ActiveEffect = {
  type: 'debuff', target: 'player', category: 'curse', name: '詛咒',
  startTime: Date.now(), duration: 60000,
  modifiers: [{ stat: 'defense', value: -20, isPercent: true }],
} as ActiveEffect;

describe('初始防禦為 -10', () => {
  it('常數就是 -10', () => {
    expect(BASE_CHARACTER_DEFENSE).toBe(-10);
  });

  it('裝備防禦要先填掉 10 點才開始有減傷', () => {
    expect(getEffectiveDefense([armor(10)], [], 0)).toBe(0);
    expect(getEffectiveDefense([armor(11)], [], 0)).toBe(1);
    expect(getEffectiveDefense([armor(50)], [], 0)).toBe(40);
  });

  it('裸裝夾底於 0，不會變成負減傷（不承受超過 100% 傷害）', () => {
    expect(getEffectiveDefense([], [], 0)).toBe(0);
    expect(getEffectiveDefense([armor(3)], [], 0)).toBe(0);
  });
});

describe('初始防禦不被百分比放大', () => {
  it('防禦%詞綴只放大裝備防禦', () => {
    // 裝備 40 +10% → 44 → 44 - 10 = 34
    // 若併進括號算會是 (40-10) × 1.1 = 33，這條斷言用來區分兩種設計
    expect(getEffectiveDefense([armor(40)], [], 10)).toBe(34);
    expect(getEffectiveDefense([armor(40)], [], 10)).not.toBe(33);
  });

  it('防禦%越高，初始防禦的懲罰不會跟著變重', () => {
    const low = getEffectiveDefense([armor(100)], [], 0);
    const high = getEffectiveDefense([armor(100)], [], 100);
    // 100 → 90；200 → 190。兩者都只被扣掉固定 10 點
    expect(low).toBe(90);
    expect(high).toBe(190);
    expect(high - low).toBe(100);
  });

  it('詛咒作用於裝備防禦，初始防禦仍是最後才減', () => {
    // floor(60 × 0.8) = 48 → 48 - 10 = 38
    expect(getEffectiveDefense([armor(60)], [curse], 0)).toBe(38);
  });

  it('詛咒疊上低防禦時一樣夾底於 0', () => {
    expect(getEffectiveDefense([armor(12)], [curse], 0)).toBe(0);
  });
});
