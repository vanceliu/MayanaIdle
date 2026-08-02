// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GeneralStore } from '../town/GeneralStore';
import { BagPanel } from '../BagPanel';
import { useGameStore } from '../../stores/gameStore';
import { getItemDefinition } from '../../models/items';
import { resolveItemIcon } from '../../models/iconMap';
import type { Character } from '../../models/character';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
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

const CURE_ITEMS = ['解毒藥水', '止血繃帶', '淨化藥水'];

beforeEach(() => {
  useGameStore.setState({
    character: testCharacter(),
    bagItems: [],
    inventory: [],
    activeEffects: [],
    combatLogs: [],
  });
  vi.spyOn(useGameStore.getState(), 'saveState').mockImplementation(() => {});
});

function buyOne(itemName: string) {
  const row = screen.getByText(itemName).closest('.shop-item') as HTMLElement;
  // 數量步進器預設為 1，直接按購買即為買 1 個
  fireEvent.click(within(row).getByRole('button', { name: /購買/ }));
}

describe('雜貨店 — 狀態解除道具', () => {
  it('三種解除道具都出現在商品列表', () => {
    render(<GeneralStore />);
    for (const name of CURE_ITEMS) {
      expect(screen.getByText(name), name).toBeDefined();
    }
  });

  it('購買後進入背包資料且數量正確', () => {
    render(<GeneralStore />);
    for (const name of CURE_ITEMS) buyOne(name);

    const bag = useGameStore.getState().bagItems;
    for (const name of CURE_ITEMS) {
      const entry = bag.find(b => b.name === name);
      expect(entry, name).toBeDefined();
      expect(entry?.amount, name).toBe(1);
      expect(entry?.type, name).toBe('potion');
    }
  });

  it('購買後顯示在背包面板上', () => {
    render(<GeneralStore />);
    for (const name of CURE_ITEMS) buyOne(name);

    render(<BagPanel />);
    for (const name of CURE_ITEMS) {
      expect(screen.getAllByText(name).length, name).toBeGreaterThan(0);
    }
  });

  it('扣款金額正確（50 + 50 + 500）', () => {
    render(<GeneralStore />);
    for (const name of CURE_ITEMS) buyOne(name);
    expect(useGameStore.getState().character?.gold).toBe(100_000 - 600);
  });
});

describe('道具 icon 一律來自 item 定義', () => {
  const EXPECTED_ICONS: Record<string, string> = {
    解毒藥水: 'items/potion-ball',
    止血繃帶: 'items/sewing-string',
    淨化藥水: 'items/bubbling-flask',
    紅色藥水: 'items/standing-potion',
  };

  it('每個解除道具都有自己的 icon 與顏色定義', () => {
    for (const name of CURE_ITEMS) {
      const def = getItemDefinition(name);
      expect(def?.icon, name).toBe(EXPECTED_ICONS[name]);
      expect(def?.iconColor, name).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('解毒藥水為藍綠色，不與綠色藥水系列撞色', () => {
    const antidote = getItemDefinition('解毒藥水')?.iconColor;
    expect(antidote).toBe('#2DD4BF');
    expect(antidote).not.toBe(getItemDefinition('綠色藥水')?.iconColor);
    expect(antidote).not.toBe(getItemDefinition('強化綠色藥水')?.iconColor);
  });

  it('同時出現在畫面上的道具顏色不重複到難以分辨', () => {
    const colors = ['紅色藥水', '橙色藥水', '白色藥水', '綠色藥水', ...CURE_ITEMS]
      .map(n => `${getItemDefinition(n)?.icon}|${getItemDefinition(n)?.iconColor}`);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('resolveItemIcon 以 item 定義為優先，而非名稱猜測', () => {
    // 解除道具的 category 是 potion，名稱不含「石」，
    // 舊邏輯會落到 material 的鑽石 icon
    expect(resolveItemIcon(getItemDefinition('解毒藥水'), 'material'))
      .toEqual({ icon: 'items/potion-ball', color: '#2DD4BF' });
    // 素材仍走 iconType / iconTier
    expect(resolveItemIcon(getItemDefinition('品質石'), 'material').icon)
      .toBe('items/cut-diamond');
    // 無定義時才回退
    expect(resolveItemIcon(undefined, 'scroll').icon).toBe('items/tied-scroll');
  });

  it('背包渲染出的 icon 與 item 定義一致（不再是鑽石）', () => {
    useGameStore.setState({
      bagItems: CURE_ITEMS.map(name => ({ name, type: 'potion' as const, amount: 1 })),
      inventory: [],
    });
    render(<BagPanel />);

    for (const name of CURE_ITEMS) {
      expect(screen.getAllByTestId(`icon-${EXPECTED_ICONS[name]}`).length, name).toBeGreaterThan(0);
    }
    expect(screen.queryByTestId('icon-items/cut-diamond')).toBeNull();
  });
});
