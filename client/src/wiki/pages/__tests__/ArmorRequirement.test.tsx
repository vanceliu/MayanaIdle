import { describe, it, expect } from 'vitest';
import { requirementText } from '../../requirementText';
import { EQUIPMENT_SEEDS } from '../../../db/seed/equipmentSeeds';
import type { EquipmentTemplate } from '../../../models/equipment';

/**
 * Wiki 的防具頁要看得到素質需求（`06-equipment.md` § 6A.8.8）。
 *
 * 只列「職業限制」的話，玩家查得到「元素師才能拿」，查不到「需要力量 24」——
 * 而需求沒滿足時整件的詞綴會凍結，那正是查表要回答的問題。
 * 武器走職業限制、沒有素質需求（§ 6A.8），所以武器頁不列這一欄。
 */
const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];

describe('素質需求文字', () => {
  it('多項需求以 / 串起來，用中文屬性名', () => {
    expect(requirementText({ STR: 24, VIT: 18 })).toBe('力量 24 / 體質 18');
  });

  it('沒有需求就是 -', () => {
    expect(requirementText(undefined)).toBe('-');
    expect(requirementText({})).toBe('-');
    expect(requirementText({ STR: 0 })).toBe('-');
  });
});

describe('素質需求的資料範圍', () => {
  it('防具家族才有需求，攻擊武器一律沒有', () => {
    // 盾牌／魔導書／臂甲雖然佔左手，設計上是防具（§ 6.6），所以照樣有素質需求
    const ARMOR_FAMILY = ['armor', 'shield', 'magicBook', 'armGuard'];
    const withReq = templates.filter(t => t.requiredAttributes && Object.keys(t.requiredAttributes).length > 0);
    expect(withReq.length).toBeGreaterThan(0);
    for (const t of withReq) {
      expect(ARMOR_FAMILY, `${t.name} 不該有素質需求`).toContain(t.type);
    }
  });

  it('有需求的防具都寫得出文字（不會印出空白欄）', () => {
    const armors = templates.filter(t => t.type === 'armor' && t.requiredAttributes);
    expect(armors.length).toBeGreaterThan(0);
    for (const t of armors) {
      expect(requirementText(t.requiredAttributes), t.name).not.toBe('-');
    }
  });
});
