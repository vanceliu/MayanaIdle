import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TradePanelContent, TradeAutoOpen } from '../TradePanel';
import { useTradeStore, type TradeSideView, type TradeOfferInput } from '../../stores/tradeStore';
import { useGameStore } from '../../stores/gameStore';
import { usePanelWindowStore } from '../../stores/panelWindowStore';

/**
 * @vitest-environment jsdom
 *
 * 金幣（`97-selfhosted-server.md` § 97.7.4）：不佔格，拉桿與輸入格同一個值。
 * 拉桿對不準確切的數字，所以一定要能直接打；兩者都是放開／離開才送出，
 * 拖動途中每一格都送等於一直打斷雙方的鎖定。
 */
const GOLD = 25_256;

function side(overrides: Partial<TradeSideView> = {}): TradeSideView {
  return {
    characterId: 1, name: '我', equipment: [], items: [], gold: 0,
    locked: false, confirmed: false, ...overrides,
  };
}

let setOffer: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setOffer = vi.fn(async (_: TradeOfferInput) => true);
  useGameStore.setState({
    character: { id: 1, name: '我', gold: GOLD } as never,
    inventory: [], bagItems: [], equippedGear: {},
  } as never);
  useTradeStore.setState({
    trade: { id: 't1', me: side(), other: side({ characterId: 2, name: '對方' }), stage: 'editing' },
    offers: [], message: null, setOffer,
  } as never);
});

describe('交易金幣', () => {
  it('輸入格打的數字就是送出的金額（Enter 送出）', () => {
    render(<TradePanelContent />);
    const input = screen.getByLabelText('金幣數量') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '5000' } });
    expect(setOffer).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(setOffer).toHaveBeenCalledWith({ equipmentIds: [], items: [], gold: 5000 });
  });

  it('離開輸入格也送出', () => {
    render(<TradePanelContent />);
    const input = screen.getByLabelText('金幣數量') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '120' } });
    fireEvent.blur(input);

    expect(setOffer).toHaveBeenCalledWith({ equipmentIds: [], items: [], gold: 120 });
  });

  it('超過持有量、負數、空白一律夾回 0～持有量', () => {
    render(<TradePanelContent />);
    const input = screen.getByLabelText('金幣數量') as HTMLInputElement;

    fireEvent.change(input, { target: { value: String(GOLD + 1) } });
    expect(input.value).toBe(String(GOLD));

    fireEvent.change(input, { target: { value: '-5' } });
    expect(input.value).toBe('0');

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('0');
  });

  it('拉桿與輸入格是同一個值', () => {
    render(<TradePanelContent />);
    const slider = screen.getByLabelText('金幣') as HTMLInputElement;
    const input = screen.getByLabelText('金幣數量') as HTMLInputElement;

    fireEvent.change(slider, { target: { value: '888' } });
    expect(input.value).toBe('888');

    fireEvent.change(input, { target: { value: '77' } });
    expect(slider.value).toBe('77');
  });

  it('拉桿拖動途中不送出，放開才送', () => {
    render(<TradePanelContent />);
    const slider = screen.getByLabelText('金幣') as HTMLInputElement;

    fireEvent.change(slider, { target: { value: '300' } });
    expect(setOffer).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    expect(setOffer).toHaveBeenCalledWith({ equipmentIds: [], items: [], gold: 300 });
  });
});

/** 任何送出都會解除雙方的鎖定，所以金額沒變就不送（§ 97.7.4） */
describe('交易金幣只在變動時送出', () => {
  it('點一下拉桿或輸入格再離開（金額沒變）不送出', () => {
    render(<TradePanelContent />);

    fireEvent.blur(screen.getByLabelText('金幣'));
    fireEvent.keyUp(screen.getByLabelText('金幣'), { key: 'Tab' });
    fireEvent.blur(screen.getByLabelText('金幣數量'));

    expect(setOffer).not.toHaveBeenCalled();
  });

  it('與 server 目前的金額相同不送出', () => {
    useTradeStore.setState({ trade: { ...useTradeStore.getState().trade!, me: side({ gold: 300 }) } } as never);
    render(<TradePanelContent />);
    const input = screen.getByLabelText('金幣數量') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '300' } });
    fireEvent.blur(input);

    expect(setOffer).not.toHaveBeenCalled();
  });

  it('送出後、回覆前再離開輸入格不重送', () => {
    setOffer.mockImplementation(() => new Promise(() => {}));
    render(<TradePanelContent />);
    const input = screen.getByLabelText('金幣數量') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '120' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(setOffer).toHaveBeenCalledTimes(1);
  });
});

/** 送出後、server 回覆前的下一次放入，以本機最後送出的內容為基準（§ 97.7.4） */
describe('連續放入', () => {
  const equipment = (id: number) => ({
    id, templateId: 1, name: `劍${id}`, type: 'sword', slot: 'rightHand', isTwoHanded: false,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: false,
  });

  const tapCell = (container: HTMLElement, index: number) => {
    const cell = container.querySelectorAll('.bag-cell:not(.empty)')[index];
    fireEvent.pointerDown(cell, { button: 0, pointerType: 'mouse' });
    fireEvent.pointerUp(cell, { button: 0, pointerType: 'mouse' });
  };

  it('回覆前連放兩件：第二次送出包含第一件', () => {
    setOffer.mockImplementation(() => new Promise(() => {}));
    useGameStore.setState({ inventory: [equipment(11), equipment(12)] } as never);
    const { container } = render(<TradePanelContent />);

    tapCell(container, 0);
    tapCell(container, 1);

    expect(setOffer).toHaveBeenLastCalledWith({ equipmentIds: [11, 12], items: [], gold: 0 });
  });

  it('回覆後以 server 推回來的內容為基準', async () => {
    useGameStore.setState({ inventory: [equipment(11), equipment(12)] } as never);
    const { container } = render(<TradePanelContent />);

    tapCell(container, 0);
    await act(async () => {});
    // server 拒絕了第一件：鏡像仍是空的
    tapCell(container, 1);

    expect(setOffer).toHaveBeenLastCalledWith({ equipmentIds: [12], items: [], gold: 0 });
  });
});

/**
 * 交易視窗沒有面板按鈕，開關完全跟著交易本身（§ 97.7.4）：
 * 取消之後留著一個寫「目前沒有交易」的空視窗，等於要玩家自己去關。
 */
describe('交易視窗的開關', () => {
  beforeEach(() => {
    usePanelWindowStore.setState({ open: { ...usePanelWindowStore.getState().open, trade: false } });
  });

  const render_ = () => render(<TradeAutoOpen />);

  it('有交易就開窗', () => {
    render_();
    expect(usePanelWindowStore.getState().open.trade).toBe(true);
  });

  it('收到交易邀請也開窗', () => {
    useTradeStore.setState({
      trade: null,
      offers: [{ id: 'o1', fromCharacterId: 2, fromName: '對方', expiresAt: 9e9 }],
    } as never);
    render_();
    expect(usePanelWindowStore.getState().open.trade).toBe(true);
  });

  it('取消之後（沒有交易也沒有邀請）視窗跟著關閉', () => {
    render_();
    expect(usePanelWindowStore.getState().open.trade).toBe(true);

    act(() => useTradeStore.setState({ trade: null, offers: [] } as never));

    expect(usePanelWindowStore.getState().open.trade).toBe(false);
  });
});
