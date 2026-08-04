import { describe, it, expect } from 'vitest';
import {
  getStarterEnhanceState,
  canEnhanceStarterGear,
  getStarterEnhanceMax,
  getStarterTemplates,
} from '../starterNpc';
import type { EquipmentInstance } from '../../models/equipment';

/**
 * 新手裝強化狀態（`13-town.md` § 13.11、`06-equipment.md` § 6.8 安定值）。
 *
 * `unsupported` 與 `maxed` 必須分開 —— 腰帶安定值 -1 是「不適用強化系統」，
 * 混為一談會在介面印出「皮腰帶 +0/-1 已滿」。
 */

function gear(over: Partial<EquipmentInstance>): EquipmentInstance {
  return {
    id: 1,
    templateId: 1,
    name: '測試裝',
    type: 'sword',
    slot: 'rightHand',
    enhancement: 0,
    stability: 6,
    isStarterGear: true,
    affixes: [],
    quality: 0,
    ...over,
  } as EquipmentInstance;
}

describe('getStarterEnhanceState', () => {
  it('未達安定值 → enhanceable', () => {
    expect(getStarterEnhanceState(gear({ enhancement: 3, stability: 6 }))).toBe('enhanceable');
  });

  it('達到安定值 → maxed', () => {
    expect(getStarterEnhanceState(gear({ enhancement: 6, stability: 6 }))).toBe('maxed');
  });

  it('安定值 -1（腰帶）→ unsupported，不是 maxed', () => {
    const belt = gear({ name: '皮腰帶', type: 'armor', slot: 'belt', enhancement: 0, stability: -1 });
    expect(getStarterEnhanceState(belt)).toBe('unsupported');
    expect(getStarterEnhanceState(belt)).not.toBe('maxed');
  });

  it('安定值 0 也是 unsupported', () => {
    expect(getStarterEnhanceState(gear({ stability: 0 }))).toBe('unsupported');
  });

  it('非新手裝一律 unsupported（此 NPC 只服務新手裝）', () => {
    expect(getStarterEnhanceState(gear({ isStarterGear: false }))).toBe('unsupported');
  });

  it('canEnhanceStarterGear 與狀態一致', () => {
    expect(canEnhanceStarterGear(gear({ enhancement: 0, stability: 6 }))).toBe(true);
    expect(canEnhanceStarterGear(gear({ enhancement: 6, stability: 6 }))).toBe(false);
    expect(canEnhanceStarterGear(gear({ stability: -1 }))).toBe(false);
  });
});

describe('新手裝 seed 的安定值符合設計文件', () => {
  it('武器安定值 6、防具 4、腰帶 -1（`06-equipment.md` § 6.8）', () => {
    const templates = getStarterTemplates('knight');
    const belt = templates.find(t => t.slot === 'belt');
    const weapon = templates.find(t => t.slot === 'rightHand');
    const chest = templates.find(t => t.slot === 'chest');

    expect(weapon?.stability).toBe(6);
    expect(chest?.stability).toBe(4);
    expect(belt?.stability).toBe(-1);
  });

  it('每個職業的新手裝都有腰帶，且都不可強化', () => {
    for (const cls of ['knight', 'elf', 'elementalist', 'priest', 'thief'] as const) {
      const belt = getStarterTemplates(cls).find(t => t.slot === 'belt');
      expect(belt, `${cls} 應有腰帶`).toBeDefined();
      expect(getStarterEnhanceMax({ ...belt, isStarterGear: true } as EquipmentInstance))
        .toBeLessThanOrEqual(0);
    }
  });
});
