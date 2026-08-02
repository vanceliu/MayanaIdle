// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GeneralStore } from '../town/GeneralStore';
import { useGameStore } from '../../stores/gameStore';
import type { Character } from '../../models/character';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

const RED_POTION_PRICE = 25;

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

function clickIn(itemName: string, name: RegExp | string) {
  fireEvent.click(within(row(itemName)).getByRole('button', { name }));
}

beforeEach(() => {
  useGameStore.setState({ character: null, bagItems: [], inventory: [] });
});

describe('雜貨店購買 — 數量步進器', () => {
  it('預設數量為 1，購買鈕顯示單價總額', () => {
    setup(100_000);
    expect(qtyInput('紅色藥水').value).toBe('1');
    expect(within(row('紅色藥水')).getByRole('button', { name: /購買/ }).textContent)
      .toContain('25');
  });

  it('直接打字輸入數量，購買後扣款與背包數量正確', () => {
    setup(100_000);
    fireEvent.change(qtyInput('紅色藥水'), { target: { value: '7' } });
    clickIn('紅色藥水', /購買/);

    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(7);
    expect(useGameStore.getState().character?.gold).toBe(100_000 - RED_POTION_PRICE * 7);
  });

  it('＋ / − / +10 / −10 按鈕會調整數量', () => {
    setup(100_000);
    const input = qtyInput('紅色藥水');

    clickIn('紅色藥水', '紅色藥水 增加數量');
    expect(input.value).toBe('2');

    clickIn('紅色藥水', '紅色藥水 增加十個');
    expect(input.value).toBe('12');

    clickIn('紅色藥水', '紅色藥水 減少數量');
    expect(input.value).toBe('11');

    clickIn('紅色藥水', '紅色藥水 減少十個');
    expect(input.value).toBe('1');
  });

  it('−10 不會讓數量掉到 1 以下', () => {
    setup(100_000);
    const input = qtyInput('紅色藥水');
    fireEvent.change(input, { target: { value: '5' } });
    clickIn('紅色藥水', '紅色藥水 減少十個');
    expect(input.value).toBe('1');
  });

  it('數量為 1 時減號與 −10 都 disabled，不會變成 0 或負數', () => {
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

    clickIn('紅色藥水', /購買/);
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(4);
    expect(useGameStore.getState().character?.gold).toBe(0);
  });

  it('非數字輸入被忽略，清空後視為 1', () => {
    setup(100_000);
    const input = qtyInput('紅色藥水');
    fireEvent.change(input, { target: { value: '1a2' } });
    expect(input.value).toBe('12');

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    clickIn('紅色藥水', /購買/);
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(1);
  });

  it('金幣不足時購買鈕 disabled', () => {
    setup(10);
    const buy = within(row('紅色藥水')).getByRole('button', { name: /購買/ }) as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
  });

  it('各商品的數量互相獨立', () => {
    setup(100_000);
    fireEvent.change(qtyInput('紅色藥水'), { target: { value: '5' } });
    expect(qtyInput('橙色藥水').value).toBe('1');
  });
});

describe('雜貨店出售 — 數量步進器', () => {
  const BAG = [{ name: '紅色藥水', type: 'potion' as const, amount: 8 }];

  function openSellTab() {
    fireEvent.click(screen.getByRole('button', { name: '出售' }));
  }

  it('可指定數量出售，金幣與剩餘數量正確', () => {
    setup(1_000, BAG);
    openSellTab();

    // 紅色藥水售價 = 買價 25 的一半 = 12
    fireEvent.change(qtyInput('紅色藥水'), { target: { value: '3' } });
    clickIn('紅色藥水', /賣出/);

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

  it('「全部」按鈕仍可一次賣光', () => {
    setup(1_000, BAG);
    openSellTab();
    clickIn('紅色藥水', '全部');
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')).toBeUndefined();
    expect(useGameStore.getState().character?.gold).toBe(1_000 + 12 * 8);
  });
});
