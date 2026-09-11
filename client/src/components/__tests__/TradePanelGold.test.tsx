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
