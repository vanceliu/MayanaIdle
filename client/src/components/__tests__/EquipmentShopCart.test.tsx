import type { BagItem } from '../../models/bagItem';
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WeaponShop } from '../town/WeaponShop';
import { useGameStore, BAG_BASE_SLOTS } from '../../stores/gameStore';
import type { Character } from '../../models/character';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { fillerBagItems } from '../../testing/bagFixtures';

/**
 * 武器店／防具店的購物車（§ 34.1 底部動作列）：
 * 裝備是唯一實例，每列數量上限 1，買賣一律由底部單一按鈕結帳。
 */

const TEMPLATES: EquipmentTemplate[] = [
  { id: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, smallMonsterDamage: 10, largeMonsterDamage: 8, buyPrice: 1000, acquireType: 'shop', tier: 2 },
  { id: 2, name: '鋼劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, smallMonsterDamage: 20, largeMonsterDamage: 16, buyPrice: 3000, acquireType: 'shop', tier: 3 },
];

const bulkAdd = vi.fn(async (records: unknown[]) => records.map((_, i) => 900 + i));
const bulkDelete = vi.fn();

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => TEMPLATES,
}));

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../../db/database', () => {
  const collection = {
    toArray: () => Promise.resolve(TEMPLATES),
    sortBy: () => Promise.resolve(TEMPLATES),
  };
  return {
    db: {
      equipmentTemplates: {
        filter: () => collection,
        where: () => ({ equals: () => collection }),
      },
      equipmentInstances: {
        bulkAdd: (...args: unknown[]) => bulkAdd(...(args as [unknown[]])),
        bulkDelete: (...args: unknown[]) => bulkDelete(...args),
      },
    },
  };
});

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

/** 背包裡的一把可販售武器（模板 buyPrice 的一半＝回收價） */
function bagWeapon(id: number, templateId: number): EquipmentInstance {
  const tpl = TEMPLATES.find(t => t.id === templateId)!;
  return {
    id, templateId, name: tpl.name, type: tpl.type, slot: tpl.slot,
    isTwoHanded: false, smallMonsterDamage: tpl.smallMonsterDamage,
    largeMonsterDamage: tpl.largeMonsterDamage,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: false,
  } as EquipmentInstance;
}

async function setup(gold: number, inventory: EquipmentInstance[] = [], bagItems: BagItem[] = []) {
  useGameStore.setState({
    character: testCharacter(gold),
    inventory,
    bagItems,
    equippedGear: {},
    activeEffects: [],
    combatLogs: [],
  });
  vi.spyOn(useGameStore.getState(), 'saveState').mockImplementation(() => {});
  render(<WeaponShop />);
  // 商品清單由 useEffect 非同步載入
  await screen.findAllByText('鐵劍');
}

function row(name: string): HTMLElement {
  const rows = Array.from(document.querySelectorAll('.shop-item')) as HTMLElement[];
  const found = rows.find(r => r.textContent?.includes(name));
  if (!found) throw new Error(`找不到列: ${name}`);
  return found;
}

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

function pick(rowName: string, label: string) {
  fireEvent.click(within(row(rowName)).getByRole('button', { name: `${label} 增加數量` }));
}

beforeEach(() => {
  bulkAdd.mockClear();
  bulkDelete.mockClear();
  useGameStore.setState({ character: null, inventory: [], bagItems: [], equippedGear: {} });
});

describe('武器店購買 — 購物車', () => {
  it('列上沒有購買鈕，動作只有底部那一顆', async () => {
    await setup(100_000);
    expect(within(row('鐵劍')).queryAllByRole('button', { name: '購買' })).toHaveLength(0);
    expect(checkoutBtn().textContent).toBe('購買');
    expect(checkoutBtn().disabled).toBe(true);
  });

  it('每件裝備數量上限為 1', async () => {
    await setup(100_000);
    pick('鐵劍', '鐵劍');

    const buttons = within(row('鐵劍'));
    expect((buttons.getByLabelText('鐵劍 數量') as HTMLInputElement).value).toBe('1');
    expect((buttons.getByRole('button', { name: '鐵劍 增加數量' }) as HTMLButtonElement).disabled).toBe(true);
    expect((buttons.getByRole('button', { name: '鐵劍 增加十個' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('可一次買多件，金幣與背包內容正確', async () => {
    await setup(100_000);
    pick('鐵劍', '鐵劍');
    pick('鋼劍', '鋼劍');

    expect(footerText('.shop-cart-summary')).toBe('已選 2 件');
    expect(footerText('.shop-cart-amount')).toBe('4,000G');

    fireEvent.click(checkoutBtn());
    // 結帳會 await DB 寫入，等 state 更新
    await vi.waitFor(() => expect(useGameStore.getState().inventory).toHaveLength(2));

    expect(bulkAdd).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().character?.gold).toBe(100_000 - 4_000);
    expect(useGameStore.getState().inventory.map(i => i.name).sort()).toEqual(['鋼劍', '鐵劍']);
  });

  it('合計超過金幣時擋下並說明原因', async () => {
    await setup(2_000);
    pick('鐵劍', '鐵劍');
    pick('鋼劍', '鋼劍');

    expect(footerText('.shop-cart-hint')).toBe('金幣不足');
    expect(checkoutBtn().disabled).toBe(true);
  });

  it('背包欄位不足時擋下並說明原因', async () => {
    const full = fillerBagItems(BAG_BASE_SLOTS);
    await setup(100_000, [], full);
    pick('鐵劍', '鐵劍');

    expect(footerText('.shop-cart-hint')).toBe('背包欄位不足');
    expect(checkoutBtn().disabled).toBe(true);
  });
});

describe('武器店出售 — 購物車', () => {
  async function openSellTab(gold: number, inventory: EquipmentInstance[]) {
    await setup(gold, inventory);
    fireEvent.click(screen.getByRole('button', { name: '出售' }));
  }

  it('可一次賣多件，金幣與背包內容正確', async () => {
    await openSellTab(0, [bagWeapon(11, 1), bagWeapon(12, 2)]);

    // 回收價為買價一半：500 + 1500
    fireEvent.click(within(row('鐵劍')).getByRole('button', { name: '鐵劍 #11 增加數量' }));
    fireEvent.click(within(row('鋼劍')).getByRole('button', { name: '鋼劍 #12 增加數量' }));

    expect(footerText('.shop-cart-summary')).toBe('已選 2 件');
    expect(footerText('.shop-cart-amount')).toBe('+2,000G');
    expect(checkoutBtn().textContent).toBe('出售');

    fireEvent.click(checkoutBtn());
    expect(useGameStore.getState().inventory).toHaveLength(0);
    expect(useGameStore.getState().character?.gold).toBe(2_000);
    expect(bulkDelete).toHaveBeenCalledWith([11, 12]);
  });

  it('沒勾任何裝備時出售鈕 disabled', async () => {
    await openSellTab(0, [bagWeapon(11, 1)]);
    expect(checkoutBtn().disabled).toBe(true);
  });
});
