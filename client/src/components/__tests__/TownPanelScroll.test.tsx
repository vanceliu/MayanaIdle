// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GeneralStore } from '../town/GeneralStore';
import { WeaponShop } from '../town/WeaponShop';
import { ArmorShop } from '../town/ArmorShop';
import { AdventurerGuild } from '../town/AdventurerGuild';
import { useGameStore } from '../../stores/gameStore';
import type { Character } from '../../models/character';
import type { EquipmentTemplate } from '../../models/equipment';

/**
 * 城鎮設施視窗的版面契約（`34-ui-guidelines.md`）：
 * 表頭（持有金幣／分頁／分類）固定，只有 `.panel-scroll` 會捲動。
 * jsdom 量不到實際捲動，但「誰在捲動區裡、誰在外面」是結構性的，可以擋回歸。
 */

const TEMPLATES: EquipmentTemplate[] = [
  { id: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, smallMonsterDamage: 5, largeMonsterDamage: 4, buyPrice: 1000, acquireType: 'shop', tier: 2 },
  { id: 2, name: '皮甲', type: 'armor', slot: 'chest', isTwoHanded: false, defense: 3, buyPrice: 800, acquireType: 'shop', tier: 2 },
];

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
    },
  };
});

function testCharacter(): Character {
  return {
    name: 'Shopper', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp: 300, maxHp: 300, mp: 100, maxMp: 100,
    baseAttributes: { STR: 20, AGI: 15, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 50000,
    currentArea: 'neutral-town', currentZone: 'newbie-neutral',
    currentRegion: 'neutral-town', currentFloor: null,
    skills: [], unspentAttributePoints: 0, quests: [],
    areaEnteredAt: 0, createdAt: 0, userId: 1, id: 1,
  };
}

function scrollRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector('.panel-scroll');
  expect(region, '面板必須有 .panel-scroll 捲動區').not.toBeNull();
  return region as HTMLElement;
}

describe('城鎮面板的捲動區', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: testCharacter(),
      bagItems: [],
      inventory: [],
      activeEffects: [],
      combatLogs: [],
    });
  });

  it('雜貨店：金幣與分頁在捲動區外，商品清單在裡面', () => {
    const { container } = render(<GeneralStore />);
    const scroll = scrollRegion(container);

    expect(scroll.contains(container.querySelector('.shop-gold'))).toBe(false);
    expect(scroll.contains(container.querySelector('.shop-tabs'))).toBe(false);
    expect(scroll.contains(container.querySelector('.shop-items'))).toBe(true);
  });

  it('武器店：分類篩選在捲動區外，商品清單在裡面', () => {
    const { container } = render(<WeaponShop />);
    const scroll = scrollRegion(container);

    const categories = container.querySelector('.bs-craft-categories');
    expect(categories, '購買頁必須有分類列').not.toBeNull();
    expect(scroll.contains(categories)).toBe(false);
    expect(scroll.contains(container.querySelector('.shop-gold'))).toBe(false);
    expect(scroll.contains(container.querySelector('.shop-items'))).toBe(true);
  });

  it('冒險者工會：難度分級釘在捲動區頂端，等階狀態在捲動區外', () => {
    const { container } = render(<AdventurerGuild />);
    const scroll = scrollRegion(container);

    expect(scroll.contains(container.querySelector('.adventurer-guild-status'))).toBe(false);
    const difficulties = container.querySelector('.shop-tabs.panel-sticky');
    expect(difficulties, '難度分級必須標成 panel-sticky').not.toBeNull();
    expect(scroll.contains(difficulties)).toBe(true);
  });

  it('防具店：分類篩選在捲動區外，商品清單在裡面', () => {
    const { container } = render(<ArmorShop />);
    const scroll = scrollRegion(container);

    const categories = container.querySelector('.bs-craft-categories');
    expect(categories, '購買頁必須有分類列').not.toBeNull();
    expect(scroll.contains(categories)).toBe(false);
    expect(scroll.contains(container.querySelector('.shop-gold'))).toBe(false);
    expect(scroll.contains(container.querySelector('.shop-items'))).toBe(true);
  });
});
