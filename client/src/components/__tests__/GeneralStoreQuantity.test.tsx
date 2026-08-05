// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GeneralStore } from '../town/GeneralStore';
import { useGameStore, BAG_BASE_SLOTS } from '../../stores/gameStore';
import { useTownStore } from '../../stores/townStore';
import type { Character } from '../../models/character';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const RED_POTION_PRICE = 25;
const ORANGE_POTION_PRICE = 80;
const ANTIDOTE_PRICE = 50;

function testCharacter(gold: number): Character {
  return {
    name: 'Shopper', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp: 300, maxHp: 300, mp: 100, maxMp: 100,
    baseAttributes: { STR: 20, AGI: 15, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold,
    currentArea: 'neutral-town', currentZone: 'newbie-neutral',
    currentRegion: 'neutral-town', currentFloor: null,
    skills: [], unspentAttributePoints: 0, quests: [],
    areaEnteredAt: 0, createdAt: 0, userId: 1, id: 1,
  };
}

function setup(gold: number, bagItems: { name: string; type: 'potion' | 'material'; amount: number }[] = []) {
  useGameStore.setState({
    character: testCharacter(gold),
    bagItems,
    inventory: [],
    equippedGear: {},
    activeEffects: [],
    combatLogs: [],
  });
  vi.spyOn(useGameStore.getState(), 'saveState').mockImplementation(() => {});
  render(<GeneralStore />);
}

function row(itemName: string): HTMLElement {
  // 出售頁的名稱會帶上「×數量」，因此以前綴比對而非完整字串
  const rows = Array.from(document.querySelectorAll('.shop-item')) as HTMLElement[];
  const found = rows.find(r =>
    r.querySelector('.shop-item-name')?.textContent?.startsWith(itemName)
  );
  if (!found) throw new Error(`找不到商品列: ${itemName}`);
  return found;
}

function qtyInput(itemName: string): HTMLInputElement {
  return within(row(itemName)).getByLabelText(`${itemName} 數量`) as HTMLInputElement;
}

function setQty(itemName: string, value: string) {
  fireEvent.change(qtyInput(itemName), { target: { value } });
}

function clickIn(itemName: string, name: RegExp | string) {
  fireEvent.click(within(row(itemName)).getByRole('button', { name }));
}

/** 底部動作列（全視窗唯一的結帳鈕） */
function footer(): HTMLElement {
  const el = document.querySelector('.shop-cart-footer');
  if (!el) throw new Error('找不到底部動作列');
  return el as HTMLElement;
}

function checkoutBtn(): HTMLButtonElement {
  return within(footer()).getByRole('button') as HTMLButtonElement;
}

function footerText(selector: string): string {
  return footer().querySelector(selector)?.textContent ?? '';
}

function openSellTab() {
  fireEvent.click(screen.getByRole('button', { name: '出售' }));
}

beforeEach(() => {
  useGameStore.setState({ character: null, bagItems: [], inventory: [], equippedGear: {} });
});

describe('雜貨店購買 — 購物車與底部結帳鈕', () => {
  it('預設數量為 0，沒選任何東西時結帳鈕 disabled', () => {
    setup(100_000);
    expect(qtyInput('紅色藥水').value).toBe('0');
    expect(checkoutBtn().disabled).toBe(true);
    expect(checkoutBtn().textContent).toBe('購買');
    expect(footerText('.shop-cart-summary')).toBe('未選擇任何項目');
    expect(footerText('.shop-cart-amount')).toBe('0G');
  });

  it('商品列上沒有各自的購買鈕，動作只有底部那一顆', () => {
    setup(100_000);
    const rowButtons = within(row('紅色藥水')).queryAllByRole('button', { name: /購買/ });
    expect(rowButtons).toHaveLength(0);
    expect(document.querySelectorAll('.shop-cart-footer').length).toBe(1);
  });

  it('底部金額顯示合計，結帳後扣款與背包數量正確', () => {
    setup(100_000);
    setQty('紅色藥水', '7');
    expect(footerText('.shop-cart-amount')).toBe(`${RED_POTION_PRICE * 7}G`);

    fireEvent.click(checkoutBtn());
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(7);
    expect(useGameStore.getState().character?.gold).toBe(100_000 - RED_POTION_PRICE * 7);
  });

  it('多品項可一次結帳', () => {
    setup(100_000);
    setQty('紅色藥水', '2');
    setQty('橙色藥水', '1');
    expect(footerText('.shop-cart-summary')).toBe('已選 2 種 · 共 3 個');
    expect(footerText('.shop-cart-amount')).toBe(`${RED_POTION_PRICE * 2 + ORANGE_POTION_PRICE}G`);

    fireEvent.click(checkoutBtn());
    const bag = useGameStore.getState().bagItems;
    expect(bag.find(b => b.name === '紅色藥水')?.amount).toBe(2);
    expect(bag.find(b => b.name === '橙色藥水')?.amount).toBe(1);
    expect(useGameStore.getState().character?.gold)
      .toBe(100_000 - RED_POTION_PRICE * 2 - ORANGE_POTION_PRICE);
  });

  it('結帳後數量歸零，不會重複買到', () => {
    setup(100_000);
    setQty('紅色藥水', '2');
    fireEvent.click(checkoutBtn());

    expect(qtyInput('紅色藥水').value).toBe('0');
    expect(checkoutBtn().disabled).toBe(true);
  });

  it('＋ / − / +10 / −10 按鈕會調整數量', () => {
    setup(100_000);
    const input = qtyInput('紅色藥水');

    clickIn('紅色藥水', '紅色藥水 增加數量');
    expect(input.value).toBe('1');

    clickIn('紅色藥水', '紅色藥水 增加十個');
    expect(input.value).toBe('11');

    clickIn('紅色藥水', '紅色藥水 減少數量');
    expect(input.value).toBe('10');

    clickIn('紅色藥水', '紅色藥水 減少十個');
    expect(input.value).toBe('0');
  });

  it('數量為 0 時減號與 −10 都 disabled，不會變成負數', () => {
    setup(100_000);
    const buttons = within(row('紅色藥水'));
    expect((buttons.getByRole('button', { name: '紅色藥水 減少數量' }) as HTMLButtonElement).disabled).toBe(true);
    expect((buttons.getByRole('button', { name: '紅色藥水 減少十個' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('輸入數量被金幣買得起的上限夾住', () => {
    setup(100); // 只買得起 4 瓶紅色藥水
    const input = qtyInput('紅色藥水');
    fireEvent.change(input, { target: { value: '999' } });
    expect(input.value).toBe('4');

    fireEvent.click(checkoutBtn());
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(4);
    expect(useGameStore.getState().character?.gold).toBe(0);
  });

  it('多品項合計超過金幣時擋下並說明原因', () => {
    setup(100);
    setQty('紅色藥水', '4');   // 100G
    setQty('解毒藥水', '1');   // +50G，合計超過持有金幣
    expect(footerText('.shop-cart-amount')).toBe(`${RED_POTION_PRICE * 4 + ANTIDOTE_PRICE}G`);
    expect(footerText('.shop-cart-hint')).toBe('金幣不足');
    expect(checkoutBtn().disabled).toBe(true);
  });

  it('背包欄位放不下新品項時擋下並說明原因', () => {
    // 背包塞滿不同品項，購買的新品項沒有格子可放
    const full = Array.from({ length: BAG_BASE_SLOTS }, (_, i) => ({
      name: `雜物${i}`, type: 'material' as const, amount: 1,
    }));
    setup(100_000, full);
    setQty('紅色藥水', '1');

    expect(footerText('.shop-cart-hint')).toBe('背包欄位不足');
    expect(checkoutBtn().disabled).toBe(true);
  });

  it('已在背包裡的品項不佔新格子，背包滿了也能補貨', () => {
    const full = [
      { name: '紅色藥水', type: 'potion' as const, amount: 1 },
      ...Array.from({ length: BAG_BASE_SLOTS - 1 }, (_, i) => ({
        name: `雜物${i}`, type: 'material' as const, amount: 1,
      })),
    ];
    setup(100_000, full);
    setQty('紅色藥水', '3');

    expect(footerText('.shop-cart-hint')).toBe('');
    expect(checkoutBtn().disabled).toBe(false);
    fireEvent.click(checkoutBtn());
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(4);
  });

  it('非數字輸入被忽略，清空後視為 0（不會誤買）', () => {
    setup(100_000);
    const input = qtyInput('紅色藥水');
    fireEvent.change(input, { target: { value: '1a2' } });
    expect(input.value).toBe('12');

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(checkoutBtn().disabled).toBe(true);
    fireEvent.click(checkoutBtn());
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')).toBeUndefined();
  });

  it('各商品的數量互相獨立', () => {
    setup(100_000);
    setQty('紅色藥水', '5');
    expect(qtyInput('橙色藥水').value).toBe('0');
  });

  it('結帳後自動關閉設施視窗', () => {
    useTownStore.setState({ facility: 'general-store' });
    setup(100_000);
    setQty('紅色藥水', '1');
    fireEvent.click(checkoutBtn());

    expect(useTownStore.getState().facility).toBe('list');
  });
});

describe('雜貨店出售 — 購物車與底部結帳鈕', () => {
  const BAG = [{ name: '紅色藥水', type: 'potion' as const, amount: 8 }];

  it('可指定數量出售，金幣與剩餘數量正確', () => {
    setup(1_000, BAG);
    openSellTab();

    // 紅色藥水售價 = 買價 25 的一半 = 12
    setQty('紅色藥水', '3');
    expect(footerText('.shop-cart-amount')).toBe(`+${12 * 3}G`);
    expect(checkoutBtn().textContent).toBe('賣出');

    fireEvent.click(checkoutBtn());
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(5);
    expect(useGameStore.getState().character?.gold).toBe(1_000 + 12 * 3);
  });

  it('數量上限為背包持有量', () => {
    setup(1_000, BAG);
    openSellTab();
    const input = qtyInput('紅色藥水');
    fireEvent.change(input, { target: { value: '99' } });
    expect(input.value).toBe('8');
  });

  it('「全部」只把數量拉到持有量，賣出仍由底部按鈕執行', () => {
    setup(1_000, BAG);
    openSellTab();
    clickIn('紅色藥水', '紅色藥水 全部');

    expect(qtyInput('紅色藥水').value).toBe('8');
    // 還沒按底部結帳鈕，東西不該消失
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(8);

    fireEvent.click(checkoutBtn());
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')).toBeUndefined();
    expect(useGameStore.getState().character?.gold).toBe(1_000 + 12 * 8);
  });

  it('多品項可一次賣出', () => {
    setup(1_000, [
      { name: '紅色藥水', type: 'potion', amount: 8 },
      { name: '橙色藥水', type: 'potion', amount: 2 },
    ]);
    openSellTab();
    setQty('紅色藥水', '2');
    setQty('橙色藥水', '2');

    // 橙色藥水售價 = 80 / 2 = 40
    expect(footerText('.shop-cart-amount')).toBe(`+${12 * 2 + 40 * 2}G`);
    fireEvent.click(checkoutBtn());

    const bag = useGameStore.getState().bagItems;
    expect(bag.find(b => b.name === '紅色藥水')?.amount).toBe(6);
    expect(bag.find(b => b.name === '橙色藥水')).toBeUndefined();
    expect(useGameStore.getState().character?.gold).toBe(1_000 + 12 * 2 + 40 * 2);
  });

  it('持有量超過 999 的素材可用「全部」一次賣光', () => {
    setup(0, [{ name: '品質石', type: 'material', amount: 1_200 }]);
    openSellTab();
    clickIn('品質石', '品質石 全部');
    expect(qtyInput('品質石').value).toBe('1200');

    fireEvent.click(checkoutBtn());
    expect(useGameStore.getState().bagItems.find(b => b.name === '品質石')).toBeUndefined();
  });
});
