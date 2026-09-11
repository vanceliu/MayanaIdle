import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TradeGrid, tradeCells } from '../TradeGrid';
import { TRADE_MAX_SLOTS, validateOffer } from '../../systems/trade';
import type { TradeSideView } from '../../stores/tradeStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { GameState } from '../../stores/gameStore';

/**
 * @vitest-environment jsdom
 *
 * 交易內容用背包格呈現（`97-selfhosted-server.md` § 97.7）：
 * 看不到詞綴與數值就等於閉著眼睛按確認，所以格子與 tooltip 與背包共用同一份。
 */
function equipment(id: number, name: string, enhancement = 0): EquipmentInstance {
  return {
    id, templateId: 1, name, type: 'sword', slot: 'rightHand', isTwoHanded: false,
    quality: 0, enhancement, affixes: [], ownerId: 1, equipped: false,
  } as EquipmentInstance;
}

function side(overrides: Partial<TradeSideView> = {}): TradeSideView {
  return {
    characterId: 1, name: '對方', equipment: [], items: [], gold: 0,
    locked: false, confirmed: false, ...overrides,
  };
}

describe('交易格', () => {
  it('固定 10 格，空格照樣畫出來（看得出還能放幾樣）', () => {
    const { container } = render(<TradeGrid side={side()} title="我提供" />);
    expect(container.querySelectorAll('.bag-cell')).toHaveLength(TRADE_MAX_SLOTS);
    expect(container.querySelectorAll('.bag-cell.empty')).toHaveLength(TRADE_MAX_SLOTS);
  });

  it('裝備帶著強化等級，道具帶著數量', () => {
    const cells = tradeCells(side({
      equipment: [equipment(7, '鐵劍', 2)],
      items: [{ itemId: 1, amount: 3 }],
    }));

    expect(cells[0]).toMatchObject({ name: '鐵劍 +2', type: 'equipment' });
    expect(cells[1]).toMatchObject({ itemId: 1, count: 3 });
  });

  it('滑過格子會出現 tooltip，裡面有裝備數值', () => {
    const { container } = render(
      <TradeGrid side={side({ equipment: [equipment(7, '鐵劍', 2)] })} title="我提供" />,
    );
    const filled = container.querySelector('.bag-cell:not(.empty)')!;
    // tooltip 走 portal 掛在 body 上（`BagTooltip`），不在元件的 container 裡
    const tooltip = () => document.body.querySelector('.bag-tooltip-content');

    expect(tooltip()).toBeNull();
    fireEvent.pointerEnter(filled);
    expect(tooltip()).toBeTruthy();

    fireEvent.pointerLeave(filled);
    expect(tooltip()).toBeNull();
  });

  it('金幣不佔格，另外標在下面', () => {
    const { container } = render(<TradeGrid side={side({ gold: 1234 })} title="我提供" />);
    expect(container.querySelectorAll('.bag-cell.empty')).toHaveLength(TRADE_MAX_SLOTS);
    expect(screen.getByText('1,234G')).toBeTruthy();
  });

  it('鎖定的一側有標記', () => {
    const { container } = render(<TradeGrid side={side({ locked: true })} title="對方提供" />);
    expect(container.querySelector('.trade-side.is-locked')).toBeTruthy();
    expect(screen.getByText('已鎖定')).toBeTruthy();
  });
});

describe('交易上限（§ 97.7）', () => {
  function state(): GameState {
    return {
      character: { id: 1, gold: 10_000 },
      inventory: Array.from({ length: 12 }, (_, i) => equipment(i + 1, `劍${i + 1}`)),
      bagItems: [],
    } as unknown as GameState;
  }

  it('裝備與道具合計超過 10 樣就擋下', () => {
    const ok = validateOffer(state(), { equipmentIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], items: [], gold: 0 });
    expect(ok.ok).toBe(true);

    const over = validateOffer(state(), { equipmentIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], items: [], gold: 0 });
    expect(over.ok).toBe(false);
    expect(over.message).toContain('10');
  });

  it('金幣不佔格 —— 放滿 10 樣仍然可以附金幣', () => {
    const result = validateOffer(state(), {
      equipmentIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      items: [],
      gold: 5_000,
    });
    expect(result.ok).toBe(true);
  });
});
