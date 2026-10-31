// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterStats } from '../CharacterStats';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';
import { BASE_CHARACTER_DEFENSE } from '../../systems/combat';

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
    expect(critRow?.textContent).toContain('5.0%');
  });

  it('物理攻擊顯示武器基傷擲骰的整段範圍（§ 21.3）', () => {
    const sword = {
      templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
      smallMonsterDamage: 15, largeMonsterDamage: 10, quality: 0, enhancement: 2,
      affixes: [], ownerId: 1, equipped: true,
    } as EquipmentInstance;
    useGameStore.setState({ equippedGear: { rightHand: sword } });
    render(<CharacterStats />);
    const rowValue = (label: string) =>
      screen.getByText(label).closest('.stat-row')?.querySelector('.stat-value')?.textContent;
    // STR 18 → +9；小怪 W = 17 → 8~17、大怪 W = 12 → 6~12
    expect(rowValue('物理(小怪)')).toBe('17~26');
    expect(rowValue('物理(大怪)')).toBe('15~21');
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

  it.each([
    // [最終防禦, 魔法減傷率]：防禦每 10 點 1%、防禦 100 封頂，加 SPI 10 的魔抗 5（`21-combat-formula.md` § 21.16）
    [60, '11.0%'],
    [100, '15.0%'],
    [150, '15.0%'],
  ])('最終防禦 %i：魔法減傷率 %s', (defense, expected) => {
    const chest = {
      templateId: 2, name: '測試甲', type: 'armor', slot: 'chest', isTwoHanded: false,
      defense: defense - BASE_CHARACTER_DEFENSE, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    } as EquipmentInstance;
    useGameStore.setState({ equippedGear: { chest } });
    render(<CharacterStats />);
    const rowValue = (label: string) =>
      screen.getByText(label).closest('.stat-row')?.querySelector('.stat-value')?.textContent;
    expect(rowValue('防禦值')).toBe(String(defense));
    expect(rowValue('魔法減傷率')).toBe(expected);
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
      expect(rowValue('掉寶率')).toBe('+0.0%');
      expect(rowValue('金幣獲得率')).toBe('+0.0%');
    });

    it('一般詞綴與 T7 獨有掉寶率加總', () => {
      useGameStore.setState({
        equippedGear: {
          chest: gear({ affixes: [{ type: 'drop_rate', tier: 3, value: 10 }, { type: 'gold_rate', tier: 3, value: 15 }] }),
          necklace: gear({ slot: 'necklace', uniqueAffix: { type: 'drop_rate', value: 60 } }),
        },
      });
      render(<CharacterStats />);
      expect(rowValue('掉寶率')).toBe('+70.0%');
      expect(rowValue('金幣獲得率')).toBe('+15.0%');
    });

    it('素質需求未滿足：詞綴凍結不計入', () => {
      useGameStore.setState({
        equippedGear: {
          chest: gear({ requiredAttributes: { STR: 99 }, affixes: [{ type: 'drop_rate', tier: 3, value: 10 }, { type: 'gold_rate', tier: 3, value: 15 }] }),
        },
      });
      render(<CharacterStats />);
      expect(rowValue('掉寶率')).toBe('+0.0%');
      expect(rowValue('金幣獲得率')).toBe('+0.0%');
    });
  });

  describe('迴避率（§ 21.6、§ 34）', () => {
    const rowValue = (label: string) =>
      screen.getByText(label).closest('.stat-row')?.querySelector('.stat-value')?.textContent;
    const helmet = {
      templateId: 1, name: '頭盔', type: 'armor', slot: 'helmet', isTwoHanded: false, defense: 0,
      quality: 0, enhancement: 0, affixes: [{ type: 'evasion', tier: 7, value: 273 }], ownerId: 1, equipped: true,
    } as EquipmentInstance;
    const evasionBuff = (value: number): ActiveEffect => ({
      id: 'eva', sourceSkillId: 'eva', sourceSkillName: 'eva', category: 'eva', type: 'buff', target: 'player',
      modifiers: [{ stat: 'evasion', value, isPercent: true }], startTime: Date.now(), duration: 60_000,
      tags: [], name: 'eva', description: '',
    });

    it('迴避值 ÷ 100 換算，顯示小數一位', () => {
      useGameStore.setState({ equippedGear: { helmet } });
      render(<CharacterStats />);
      // 騎士基礎 5 + AGI 14（有效 12）→ 4 + 273 迴避值 → 2.73
      expect(rowValue('迴避率')).toBe('11.7%');
    });

    it('超過上限時括號標示實際值', () => {
      useGameStore.setState({ activeEffects: [evasionBuff(30)] });
      render(<CharacterStats />);
      expect(rowValue('迴避率')).toBe('35.0%（39.0%）');
    });

    it('未超過上限不加括號', () => {
      render(<CharacterStats />);
      expect(rowValue('迴避率')).toBe('9.0%');
    });
  });

  it('returns null when no character', () => {
    useGameStore.setState({ character: null });
    const { container } = render(<CharacterStats />);
    expect(container.innerHTML).toBe('');
  });
});
