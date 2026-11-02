// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WeaponShop } from '../town/WeaponShop';
import { ArmorShop } from '../town/ArmorShop';
import { GeneralStore } from '../town/GeneralStore';
import { useGameStore } from '../../stores/gameStore';
import type { Character } from '../../models/character';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { ITEM_DEFINITIONS } from '../../db/seed';
import { formatMaterialUsage } from '../../systems/craftMaterialUsage';
import { bagItem, bagItemById } from '../../testing/bagFixtures';

/** 武器店／防具店／雜貨店清單：一列只印名稱，完整內容走 hover tooltip（`34-ui-guidelines.md` 使用場景表） */

const TEMPLATES: EquipmentTemplate[] = [
  { id: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, smallMonsterDamage: 10, largeMonsterDamage: 8, material: 'iron', buyPrice: 1000, acquireType: 'shop', tier: 2 },
  { id: 2, name: '鐵盔', type: 'armor', slot: 'helmet', isTwoHanded: false, defense: 3, material: 'iron', buyPrice: 800, acquireType: 'shop', tier: 2 },
];

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => TEMPLATES,
}));

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

function testCharacter(): Character {
  return {
    name: 'Shopper', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp: 300, maxHp: 300, mp: 100, maxMp: 100,
    baseAttributes: { STR: 20, AGI: 15, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 100_000,
    currentArea: 'neutral-town', currentZone: 'newbie-neutral',
    currentRegion: 'neutral-town', currentFloor: null,
    skills: [], unspentAttributePoints: 0, quests: [],
    areaEnteredAt: 0, createdAt: 0, userId: 1, id: 1,
  };
}

function instanceOf(id: number, templateId: number, enhancement: number): EquipmentInstance {
  const tpl = TEMPLATES.find(t => t.id === templateId)!;
  return {
    id, templateId, name: tpl.name, type: tpl.type, slot: tpl.slot, isTwoHanded: false,
    smallMonsterDamage: tpl.smallMonsterDamage, largeMonsterDamage: tpl.largeMonsterDamage,
    defense: tpl.defense, material: tpl.material,
    quality: 0, enhancement, affixes: [{ type: 'crit_rate', tier: 2, value: 7 }], ownerId: 1, equipped: false,
  } as EquipmentInstance;
}

function setup(state: Partial<{ inventory: EquipmentInstance[]; bagItems: ReturnType<typeof bagItem>[] }> = {}) {
  useGameStore.setState({
    character: testCharacter(),
    inventory: state.inventory ?? [],
    bagItems: state.bagItems ?? [],
    equippedGear: {},
    activeEffects: [],
    combatLogs: [],
  });
}

function rowOf(name: string): HTMLElement {
  const row = Array.from(document.querySelectorAll('.item-list-row'))
    .find(r => r.querySelector('.item-list-name')?.textContent === name);
  if (!row) throw new Error(`找不到列: ${name}`);
  return row as HTMLElement;
}

function hover(row: HTMLElement): HTMLElement {
  fireEvent.mouseEnter(row.querySelector('.tooltip-trigger')!);
  act(() => { vi.advanceTimersByTime(300); });
  const popup = document.querySelector('.tooltip-popup') as HTMLElement | null;
  if (!popup) throw new Error('tooltip 沒有出現');
  return popup;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('武器店／防具店清單', () => {
  it('購買列只印 icon、名稱、價格，裝備數值在 hover tooltip', () => {
    setup();
    render(<WeaponShop />);

    const row = rowOf('鐵劍');
    expect(row.querySelector('[data-testid^="icon-"]')).not.toBeNull();
    expect(row.querySelector('.item-list-price')?.textContent).toBe('1,000G');
    expect(row.querySelector('.equip-detail')).toBeNull();
    expect(row.textContent).not.toContain('攻擊');

    const popup = hover(row);
    expect(popup.querySelector('.equip-detail')).not.toBeNull();
    expect(popup.textContent).toContain('攻擊: 10/8');
  });

  it('出售列名稱帶強化等級與回收價，詞綴在 hover tooltip', () => {
    setup({ inventory: [instanceOf(11, 2, 2)] });
    render(<ArmorShop />);
    fireEvent.click(screen.getByRole('button', { name: '出售' }));

    const row = rowOf('鐵盔 +2');
    expect(row.querySelector('.item-list-price')?.textContent).toBe('+400G');
    expect(row.textContent).not.toContain('爆擊率');

    const popup = hover(row);
    expect(popup.textContent).toContain('爆擊率');
  });
});

describe('雜貨店清單', () => {
  it('購買列不印說明與重量，hover 顯示說明、重量且不顯示數量', () => {
    setup();
    render(<GeneralStore />);

    const row = rowOf('武器強化卷軸');
    expect(row.querySelector('.item-list-price')?.textContent).toBe('100,000G');
    expect(row.textContent).not.toContain('重量');

    const popup = hover(row);
    expect(popup.textContent).toContain('武器強化等級 +1');
    expect(popup.textContent).toContain('重量');
    expect(popup.textContent).not.toContain('數量');
  });

  it('藥水的 tooltip 與背包相同（回復量），購買頁不顯示數量', () => {
    setup();
    render(<GeneralStore />);

    const popup = hover(rowOf('紅色藥水'));
    expect(popup.textContent).toContain('回復 10~15 HP');
    expect(popup.textContent).not.toContain('數量');
  });

  it('出售列保留數量與 ⚒ 標記，用途文字與持有數量在 tooltip', () => {
    const material = ITEM_DEFINITIONS.find(d => d.category === 'material' && formatMaterialUsage(d.id) && !d.noSell)!;
    setup({ bagItems: [bagItemById(material.id, 7)] });
    render(<GeneralStore />);
    fireEvent.click(screen.getByRole('button', { name: '出售' }));

    const row = rowOf(material.name);
    const label = row.querySelector('.storage-equip-name')!;
    expect(label.textContent).toBe(`${material.name} ×7⚒`);

    const popup = hover(row);
    expect(popup.textContent).toContain(`用途：${formatMaterialUsage(material.id)}`);
    expect(popup.textContent).toContain('數量: 7');
  });

  it('解狀態道具的出售 tooltip 帶說明', () => {
    setup({ bagItems: [bagItem('解毒藥水', 3)] });
    render(<GeneralStore />);
    fireEvent.click(screen.getByRole('button', { name: '出售' }));

    expect(hover(rowOf('解毒藥水')).textContent).toContain('解除中毒');
  });
});
