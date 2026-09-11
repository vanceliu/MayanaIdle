import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TradeSourceGrid, sourceCells } from '../TradeSourceGrid';
import { TradeGrid } from '../TradeGrid';
import type { TradeSideView } from '../../stores/tradeStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { BagItem } from '../../models/bagItem';
import { getItemById } from '../../models/items';

/** 格子名稱一律由 `itemId` 反查，測試也跟著查，不寫死字面名稱 */
const STACK_ID = 1;
const STACK_NAME = getItemById(STACK_ID)!.name;

/**
 * @vitest-environment jsdom
 *
 * 放入交易的方式（`97-selfhosted-server.md` § 97.7.4）：
 * 來源是背包格，滑過看得到詞綴與強化 —— 同名同階的武器只有數值分得出來，
 * 條列式的名稱清單等於要玩家先放進去才知道拿錯。
 */
function equipment(id: number, name: string, extra: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    id, templateId: 1, name, type: 'sword', slot: 'rightHand', isTwoHanded: false,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: false, ...extra,
  } as EquipmentInstance;
}

const bag = (itemId: number, name: string, amount: number): BagItem =>
  ({ itemId, name, type: 'material', amount });

function renderSource(overrides: Partial<Parameters<typeof TradeSourceGrid>[0]> = {}) {
  const onPut = vi.fn();
  const view = render(
    <TradeSourceGrid
      inventory={[equipment(1, '鐵劍'), equipment(2, '鐵劍', { enhancement: 3 })]}
      bagItems={[bag(STACK_ID, STACK_NAME, 31)]}
      placedEquipmentIds={[]}
      placedItems={{}}
      full={false}
      onPut={onPut}
      {...overrides}
    />,
  );
  return { onPut, ...view };
}

describe('交易來源格', () => {
  it('同名裝備各佔一格，強化等級跟著名稱走（分得出是哪一把）', () => {
    const cells = sourceCells({
      inventory: [equipment(1, '鐵劍'), equipment(2, '鐵劍', { enhancement: 3 })],
      bagItems: [], placedEquipmentIds: [], placedItems: {},
    });

    expect(cells.map(c => c.name)).toEqual(['鐵劍', '鐵劍 +3']);
    expect(cells.map(c => c.equipment?.id)).toEqual([1, 2]);
  });

  it('新手裝與已放入的裝備不出現在來源', () => {
    const cells = sourceCells({
      inventory: [
        equipment(1, '鐵劍'),
        equipment(2, '新手劍', { isStarterGear: true } as Partial<EquipmentInstance>),
        equipment(3, '長劍'),
      ],
      bagItems: [], placedEquipmentIds: [3], placedItems: {},
    });

    expect(cells.map(c => c.name)).toEqual(['鐵劍']);
  });

  it('道具只顯示還沒放進去的數量，放完就不再出現', () => {
    const base = { inventory: [], placedEquipmentIds: [] };
    expect(sourceCells({ ...base, bagItems: [bag(STACK_ID, STACK_NAME, 31)], placedItems: { [STACK_ID]: 25 } })[0].count).toBe(6);
    expect(sourceCells({ ...base, bagItems: [bag(STACK_ID, STACK_NAME, 31)], placedItems: { [STACK_ID]: 31 } })).toEqual([]);
  });

  it('點裝備直接放入（觸控沒有拖曳，點擊一定要能放）', () => {
    const { onPut, container } = renderSource();
    const cell = container.querySelectorAll('.bag-cell:not(.empty)')[1];

    fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(cell, { button: 0, pointerType: 'mouse' });

    expect(onPut).toHaveBeenCalledWith({ equipmentId: 2, amount: 1 });
  });

  it('點堆疊道具先問數量，按「全部」再放入才送出整疊', () => {
    const { onPut, container } = renderSource();
    const stack = [...container.querySelectorAll('.bag-cell:not(.empty)')]
      .find(c => c.querySelector('.bag-cell-count'))!;

    fireEvent.pointerDown(stack, { button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(stack, { button: 0, pointerType: 'mouse' });
    expect(onPut).not.toHaveBeenCalled();

    const slider = screen.getByLabelText(`${STACK_NAME} 數量`) as HTMLInputElement;
    expect(slider.value).toBe('1');
    expect(slider.max).toBe('31');

    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    fireEvent.click(screen.getByRole('button', { name: '放入' }));

    expect(onPut).toHaveBeenCalledWith({ itemId: STACK_ID, amount: 31 });
    expect(screen.queryByLabelText(`${STACK_NAME} 數量`)).toBeNull();
  });

  it('只放一部分：拉桿的數字就是放入的數量', () => {
    const { onPut, container } = renderSource();
    const stack = [...container.querySelectorAll('.bag-cell:not(.empty)')]
      .find(c => c.querySelector('.bag-cell-count'))!;

    fireEvent.pointerDown(stack, { button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(stack, { button: 0, pointerType: 'mouse' });
    fireEvent.change(screen.getByLabelText(`${STACK_NAME} 數量`), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '放入' }));

    expect(onPut).toHaveBeenCalledWith({ itemId: STACK_ID, amount: 7 });
  });

  it('放滿之後，已經放進去的那一種道具還能再加量（合併不佔新格）', () => {
    const { onPut, container } = renderSource({ full: true, placedItems: { [STACK_ID]: 5 } });
    const stack = [...container.querySelectorAll('.bag-cell:not(.empty)')]
      .find(c => c.querySelector('.bag-cell-count'))!;

    expect(stack.className).not.toContain('is-disabled');
    fireEvent.pointerDown(stack, { button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(stack, { button: 0, pointerType: 'mouse' });
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    fireEvent.click(screen.getByRole('button', { name: '放入' }));

    // 剩下的量才是上限：31 - 5
    expect(onPut).toHaveBeenCalledWith({ itemId: STACK_ID, amount: 26 });
  });

  it('放滿之後，沒放過的道具與所有裝備都放不進去', () => {
    const { onPut, container } = renderSource({ full: true, placedItems: {} });
    for (const cell of container.querySelectorAll('.bag-cell:not(.empty)')) {
      expect(cell.className).toContain('is-disabled');
      fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse' });
      fireEvent.pointerUp(cell, { button: 0, pointerType: 'mouse' });
    }
    expect(onPut).not.toHaveBeenCalled();
  });

  it('標成放置目標：交易格拖回來才有地方放', () => {
    const { container } = renderSource();
    expect(container.querySelector('[data-drop-kind="trade-source"]')).toBeTruthy();
  });
});

describe('從交易格取出（§ 97.7.4）', () => {
  const side = (overrides: Partial<TradeSideView> = {}): TradeSideView => ({
    characterId: 1, name: '我', equipment: [], items: [], gold: 0,
    locked: false, confirmed: false, ...overrides,
  });

  it('編輯中點一下就拿回來', () => {
    const onTake = vi.fn();
    const { container } = render(
      <TradeGrid side={side({ equipment: [equipment(7, '鐵劍')] })} title="我提供" onTake={onTake} />,
    );
    const cell = container.querySelector('.bag-cell:not(.empty)')!;

    fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(cell, { button: 0, pointerType: 'mouse' });

    expect(onTake).toHaveBeenCalledTimes(1);
    expect(onTake.mock.calls[0][0].equipment.id).toBe(7);
  });

  it('對方那一側不是放置目標，也拿不動', () => {
    const onTake = vi.fn();
    const mine = render(<TradeGrid side={side()} title="我提供" onTake={onTake} />);
    const theirs = render(<TradeGrid side={side({ name: '對方' })} title="對方提供" />);

    expect(mine.container.querySelector('[data-drop-kind="trade-offer"]')).toBeTruthy();
    expect(theirs.container.querySelector('[data-drop-kind="trade-offer"]')).toBeNull();
  });
});
