// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { AuctionHouse } from '../town/AuctionHouse';
import { useGameStore } from '../../stores/gameStore';
import { useAuctionStore } from '../../stores/auctionStore';
import { bagItem } from '../../testing/bagFixtures';
import { getItemId } from '../../models/items';
import {
  AUCTION_LISTING_FEE, AUCTION_MAX_LISTINGS, DEFAULT_AUCTION_QUERY, type AuctionListing,
} from '../../models/auction';

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

/** 拍賣場視窗（`57-auction.md`） */
const ORE = getItemId('銀礦石')!;

const open = vi.fn(async () => true);
const close = vi.fn(async () => true);
const search = vi.fn(async () => true);
const list = vi.fn(async () => true);
const buy = vi.fn(async () => true);
const cancel = vi.fn(async () => true);

const listing = (over: Partial<AuctionListing>): AuctionListing => ({
  id: 1, sellerCharacterId: 2, sellerName: 'Bob', kind: 'item', itemId: ORE, amount: 3,
  price: { kind: 'gold', gold: 800 }, createdAt: 0, ...over,
});

beforeEach(() => {
  for (const fn of [open, close, search, list, buy, cancel]) fn.mockClear();
  useGameStore.setState({
    character: { id: 1, name: '我', gold: 10_000 } as never,
    bagItems: [bagItem('銀礦石', 2)],
    inventory: [],
    storedEquipment: [],
    storedMaterials: [bagItem('銀礦石', 5)],
    personalStoredEquipment: [],
    personalStoredMaterials: [],
    equippedGear: {},
  });
  useAuctionStore.setState({
    results: { query: DEFAULT_AUCTION_QUERY, listings: [listing({}), listing({ id: 2, sellerCharacterId: 1, sellerName: '我' })], total: 2 },
    mine: [],
    message: null,
    open, close, search, list, buy, cancel,
  });
});

const tab = (name: RegExp | string) => screen.getByRole('button', { name });

describe('拍賣場視窗', () => {
  it('打開時要清單，關閉時釋放', () => {
    const { unmount } = render(<AuctionHouse />);
    expect(open).toHaveBeenCalledTimes(1);
    unmount();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('購買先確認；自己上架的不能買', () => {
    render(<AuctionHouse />);
    const [, theirs, own] = screen.getAllByRole('row');
    fireEvent.click(within(theirs).getByRole('button', { name: '購買' }));
    expect(buy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    expect(buy).toHaveBeenCalledWith(1);
    expect((within(own).getByRole('button', { name: '購買' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('換條件即送出搜尋並回到第一頁；名稱按 Enter 才送', () => {
    render(<AuctionHouse />);
    fireEvent.change(screen.getByRole('combobox', { name: '標價' }), { target: { value: 'item' } });
    expect(search).toHaveBeenLastCalledWith({ ...DEFAULT_AUCTION_QUERY, priceKind: 'item' });

    const name = screen.getByRole('textbox', { name: '名稱' });
    fireEvent.change(name, { target: { value: '銀' } });
    expect(search).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(search).toHaveBeenLastCalledWith({ ...DEFAULT_AUCTION_QUERY, name: '銀' });
  });

  it('詞綴用分組選單挑選，選了就送出', () => {
    render(<AuctionHouse />);
    fireEvent.click(screen.getByRole('button', { name: /＋ 詞綴/ }));
    fireEvent.change(screen.getByPlaceholderText('搜尋名稱'), { target: { value: '攻擊力' } });
    fireEvent.click(screen.getByRole('button', { name: '攻擊力' }));
    expect(search).toHaveBeenLastCalledWith({ ...DEFAULT_AUCTION_QUERY, affixes: [{ type: 'attack_power' }] });
  });

  it('切到道具：清掉裝備專用條件，保留標價與排序；不顯示階級與詞綴', () => {
    useAuctionStore.setState({
      results: { query: { ...DEFAULT_AUCTION_QUERY, tiers: [5], priceKind: 'gold', sort: 'price_asc' }, listings: [], total: 0 },
    });
    render(<AuctionHouse />);
    fireEvent.click(screen.getByRole('tab', { name: '道具' }));
    expect(search).toHaveBeenLastCalledWith({ ...DEFAULT_AUCTION_QUERY, kind: 'item', priceKind: 'gold', sort: 'price_asc' });

    act(() => useAuctionStore.setState({ results: { query: { ...DEFAULT_AUCTION_QUERY, kind: 'item' }, listings: [], total: 0 } }));
    expect(screen.queryByRole('group', { name: '階級' })).toBeNull();
    expect(screen.queryByRole('button', { name: /＋ 詞綴/ })).toBeNull();
  });

  it('上架道具：三處合計，送出數量與標價', () => {
    render(<AuctionHouse />);
    fireEvent.click(tab('上架'));
    const row = screen.getByRole('radio', { name: /銀礦石/ });
    expect(within(row).getByText('×7')).toBeTruthy();
    fireEvent.click(row);
    fireEvent.change(screen.getByRole('spinbutton', { name: '數量' }), { target: { value: '6' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: '金幣價格' }), { target: { value: '1500' } });
    fireEvent.click(screen.getAllByRole('button', { name: '上架' }).at(-1)!);
    expect(list).toHaveBeenCalledWith({ kind: 'item', itemId: ORE, amount: 6, price: { kind: 'gold', gold: 1500 } });
  });

  it(`金幣不足 ${AUCTION_LISTING_FEE} 或已滿 ${AUCTION_MAX_LISTINGS} 筆時不能上架`, () => {
    useGameStore.setState({ character: { id: 1, name: '我', gold: AUCTION_LISTING_FEE - 1 } as never });
    render(<AuctionHouse />);
    fireEvent.click(tab('上架'));
    fireEvent.click(screen.getByRole('radio', { name: /銀礦石/ }));
    expect((screen.getAllByRole('button', { name: '上架' }).at(-1) as HTMLButtonElement).disabled).toBe(true);
  });

  it('我的上架：顯示筆數，下架先確認', () => {
    useAuctionStore.setState({ mine: [listing({ id: 9, sellerCharacterId: 1 })] });
    render(<AuctionHouse />);
    fireEvent.click(tab(/我的上架/));
    expect(screen.getByText(`1/${AUCTION_MAX_LISTINGS}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '下架' }));
    fireEvent.click(screen.getByRole('button', { name: '確定' }));
    expect(cancel).toHaveBeenCalledWith(9);
  });
});
