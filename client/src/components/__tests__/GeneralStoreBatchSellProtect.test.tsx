import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeneralStore } from '../town/GeneralStore';
import { useGameStore } from '../../stores/gameStore';

/**
 * @vitest-environment jsdom
 *
 * 批量販售的用途保護（`39-batch-sell.md` § 39.4）。
 * 顏色只表達稀有度，「Tier N 以下」會連配方素材與強化石／品質石一起掃掉。
 */

// 全部是 iconTier 1~4，「Tier 4 以下」會全部命中
const BAG = [
  { name: '破碎獸牙', type: 'material' as const, amount: 10 },   // T1 純販售
  { name: '石像碎片', type: 'material' as const, amount: 5 },    // T2 T4 配方
  { name: '強化石', type: 'material' as const, amount: 3 },      // T4 鐵匠鋪用
  { name: '品質石', type: 'material' as const, amount: 2 },      // T4 鐵匠鋪用
];

function setup(gold = 1000) {
  useGameStore.setState({
    character: {
      name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 1,
      hp: 1, maxHp: 1, mp: 1, maxMp: 1,
      baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold, currentArea: 'neutral-town', currentZone: 'newbie-neutral',
      currentRegion: 'neutral-town', currentFloor: null,
      skills: [], quests: [], unspentAttributePoints: 0,
      areaEnteredAt: 0, createdAt: 0, userId: 1,
    },
    bagItems: BAG,
    inventory: [],
    equippedGear: {},
  });
  render(<GeneralStore />);
  fireEvent.click(screen.getByRole('button', { name: '出售' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } });
}

describe('雜貨店批量販售：用途保護', () => {
  beforeEach(() => setup());

  it('預設勾選「跳過有用途的素材」', () => {
    const checkbox = screen.getByRole('checkbox', { name: /跳過有用途的素材/ });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it('預設只賣純販售素材，配方素材與強化石／品質石都被保留', () => {
    const button = screen.getByRole('button', { name: /一鍵販售/ });
    expect(button.textContent).toContain('1 種');

    const protectedNote = screen.getByText(/已保留 3 種有用途的素材/);
    for (const name of ['石像碎片', '強化石', '品質石']) {
      expect(protectedNote.textContent).toContain(name);
    }
  });

  it('被保留的素材要明確列出，不可靜默漏掉', () => {
    // 沒有這行提示，玩家會以為「Tier 4 以下」真的全賣了
    expect(screen.queryByText(/已保留/)).not.toBeNull();
  });

  it('取消勾選後回到純粹依 iconTier 篩選', () => {
    fireEvent.click(screen.getByRole('checkbox', { name: /跳過有用途的素材/ }));

    expect(screen.getByRole('button', { name: /一鍵販售/ }).textContent).toContain('4 種');
    expect(screen.queryByText(/已保留/)).toBeNull();
  });

  it('實際販售只結算未被保護的素材，配方素材留在背包', () => {
    fireEvent.click(screen.getByRole('button', { name: /一鍵販售/ }));

    const remaining = useGameStore.getState().bagItems.map(b => b.name);
    expect(remaining).not.toContain('破碎獸牙');
    expect(remaining).toEqual(expect.arrayContaining(['石像碎片', '強化石', '品質石']));
  });
});
