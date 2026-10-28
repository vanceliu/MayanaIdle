// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterStats } from '../CharacterStats';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';

describe('CharacterStats', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: {
        name: 'TestHero',
        className: 'knight',
        level: 10,
        exp: 0,
        expToNext: 1000,
        hp: 100,
        maxHp: 100,
        mp: 30,
        maxMp: 30,
        baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
        bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        gold: 1000,
        currentArea: 'dawn-plains',
        currentZone: 'newbie-neutral',
        currentRegion: 'dawn-plains',
        currentFloor: null,
        skills: [],
        unspentAttributePoints: 0,
        quests: [],
        areaEnteredAt: Date.now(),
        createdAt: Date.now(),
        userId: 1,
      },
      equippedGear: {},
      activeEffects: [],
    });
  });

  it('renders stats directly without collapsible wrapper', () => {
    render(<CharacterStats />);
    expect(screen.getByText('物理(小怪)')).toBeDefined();
    expect(screen.getByText('防禦值')).toBeDefined();
    expect(screen.getByText('爆擊率')).toBeDefined();
    expect(screen.getByText('每次回血')).toBeDefined();
  });

  it('computes base stats without equipment', () => {
    render(<CharacterStats />);
    expect(screen.getByText('物理(小怪)')).toBeDefined();
    expect(screen.getByText('物理(大怪)')).toBeDefined();
    // 基礎爆擊率 5%（§ 21.8）。「5%」可能同時出現在其他列（例如魔法減傷率），
    // 因此鎖定爆擊率所在的那一列比對，而非全頁搜尋。
    const critRow = screen.getByText('爆擊率').closest('.stat-row');
    expect(critRow?.textContent).toContain('5%');
  });

  it('每個欄位的標籤都有 tooltip 觸發器（§ 34 詳細狀態面板）', () => {
    const { container } = render(<CharacterStats />);
    const rows = container.querySelectorAll('.stat-row');
    expect(rows.length).toBeGreaterThan(15);
    for (const row of rows) {
      expect(row.querySelector('.tooltip-trigger .stat-label'), row.textContent ?? '').not.toBeNull();
      expect(row.querySelector('.stat-value'), row.textContent ?? '').not.toBeNull();
    }
  });

  it('魔法抗性與魔法減傷率是兩個獨立欄位', () => {
    render(<CharacterStats />);
    expect(screen.getByText('魔法抗性')).toBeDefined();
    expect(screen.getByText('魔法減傷率')).toBeDefined();
  });

  /** `29-regen.md` § 29.1~29.2：面板與自然回復 tick 同一套 */
  describe('每次回血／每次回魔', () => {
    const regenItem = (over: Partial<EquipmentInstance>) => ({
      templateId: 1, name: 'x', type: 'armor', slot: 'chest', isTwoHanded: false,
      quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ...over,
    }) as EquipmentInstance;
    const necklace = (over: Partial<EquipmentInstance> = {}) =>
      regenItem({ slot: 'necklace', hpRegen: 2, mpRegen: 3, ...over });
    const chest = (over: Partial<EquipmentInstance> = {}) => regenItem({
      affixes: [{ type: 'hp_regen', tier: 3, value: 6 }, { type: 'mp_regen', tier: 4, value: 8 }],
      ...over,
    });
    const rowValue = (label: string) =>
      screen.getByText(label).closest('.stat-row')?.querySelector('.stat-value')?.textContent;

    // VIT 16 → 8、SPI 10 → 5
    it('裸裝只有屬性基礎量', () => {
      render(<CharacterStats />);
      expect(rowValue('每次回血')).toBe('8');
      expect(rowValue('每次回魔')).toBe('5');
    });

    it('模板值與詞綴同時計入', () => {
      useGameStore.setState({ equippedGear: { necklace: necklace(), chest: chest() } });
      render(<CharacterStats />);
      expect(rowValue('每次回血')).toBe(String(8 + 2 + 6));
      expect(rowValue('每次回魔')).toBe(String(5 + 3 + 8));
    });

    it('素質需求未滿足：詞綴凍結，模板值照算', () => {
      const unmet = { requiredAttributes: { STR: 99 } };
      useGameStore.setState({ equippedGear: { necklace: necklace(unmet), chest: chest(unmet) } });
      render(<CharacterStats />);
      expect(rowValue('每次回血')).toBe(String(8 + 2));
      expect(rowValue('每次回魔')).toBe(String(5 + 3));
    });
  });

  /** `34-ui-guidelines.md` § 34.3：掉落區塊只顯示裝備詞綴合計 */
  describe('掉寶率／金幣獲得率', () => {
    const gear = (over: Partial<EquipmentInstance>) => ({
      templateId: 1, name: 'x', type: 'armor', slot: 'chest', isTwoHanded: false,
      quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ...over,
    }) as EquipmentInstance;
    const rowValue = (label: string) =>
      screen.getByText(label).closest('.stat-row')?.querySelector('.stat-value')?.textContent;

    it('裸裝為 +0%', () => {
      render(<CharacterStats />);
      expect(rowValue('掉寶率')).toBe('+0%');
      expect(rowValue('金幣獲得率')).toBe('+0%');
    });

    it('一般詞綴與 T7 獨有掉寶率加總', () => {
      useGameStore.setState({
        equippedGear: {
          chest: gear({ affixes: [{ type: 'drop_rate', tier: 3, value: 10 }, { type: 'gold_rate', tier: 3, value: 15 }] }),
          necklace: gear({ slot: 'necklace', uniqueAffix: { type: 'drop_rate', value: 60 } }),
        },
      });
      render(<CharacterStats />);
      expect(rowValue('掉寶率')).toBe('+70%');
      expect(rowValue('金幣獲得率')).toBe('+15%');
    });

    it('素質需求未滿足：詞綴凍結不計入', () => {
      useGameStore.setState({
        equippedGear: {
          chest: gear({ requiredAttributes: { STR: 99 }, affixes: [{ type: 'drop_rate', tier: 3, value: 10 }, { type: 'gold_rate', tier: 3, value: 15 }] }),
        },
      });
      render(<CharacterStats />);
      expect(rowValue('掉寶率')).toBe('+0%');
      expect(rowValue('金幣獲得率')).toBe('+0%');
    });
  });

  it('returns null when no character', () => {
    useGameStore.setState({ character: null });
    const { container } = render(<CharacterStats />);
    expect(container.innerHTML).toBe('');
  });
});
