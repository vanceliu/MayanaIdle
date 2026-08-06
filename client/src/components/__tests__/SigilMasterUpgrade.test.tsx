// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { SigilMaster } from '../town/SigilMaster';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { Affix } from '../../models/affix';
import { POLISH_SIGIL_GOLD_COST } from '../../models/sigil';
import { makeBagItem } from '../../models/bagItem';
import { getItemId } from '../../models/items';

/**
 * 印記師的升階分頁（`46-sigil.md` § 46.2）：同一份詞綴清單，
 * 依該條詞綴當前的 Tier 決定消耗精鍊印記（必定成功）或突破印記（有失敗率）。
 * 品質提升是另一個分頁，對象是整件裝備（§ 46.8）。
 */

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

function gear(affixes: Affix[], over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    id: 1,
    templateId: 100,
    name: '鋼心劍',
    type: 'sword',
    slot: 'rightHand',
    isTwoHanded: false,
    smallMonsterDamage: 20,
    largeMonsterDamage: 18,
    weight: 15,
    quality: 0,
    enhancement: 0,
    stability: 6,
    affixes,
    ownerId: 1,
    equipped: false,
    ...over,
  } as EquipmentInstance;
}

function setup(item: EquipmentInstance, bag: { name: string; amount: number }[], gold = 1_000_000) {
  useGameStore.setState({
    character: {
      name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 1,
      hp: 1, maxHp: 1, mp: 1, maxMp: 1,
      baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold, currentArea: 'neutral-town', currentZone: 'newbie-neutral',
      currentRegion: 'neutral-town', currentFloor: null,
      skills: [], quests: [], unspentAttributePoints: 0,
      areaEnteredAt: 0, createdAt: 0, userId: 1, id: 1,
    } as never,
    // 背包格一律由 seed 反查（`models/bagItem.ts`），不手寫 name／type
    bagItems: bag.map(b => makeBagItem(getItemId(b.name)!, b.amount)!),
    inventory: [item],
    equippedGear: {},
  });
  render(<SigilMaster />);
}

const openTab = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

describe('印記師 — 詞綴升階分頁', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('管道上限以內的詞綴消耗精鍊印記，必定成功', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '精鍊印記', amount: 2 },
      { name: '突破印記', amount: 1 },
    ]);
    openTab('詞綴升階');

    expect(screen.getByText(/精鍊印記×1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '升階' }));

    const affix = useGameStore.getState().inventory[0].affixes![0];
    expect(affix.tier).toBe(4);
    const bag = useGameStore.getState().bagItems;
    expect(bag.find(b => b.name === '精鍊印記')?.amount).toBe(1);
    // 沒動到突破印記
    expect(bag.find(b => b.name === '突破印記')?.amount).toBe(1);
  });

  it('T5 改由突破印記受理，並標出成功率', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // < 10%，成功
    setup(gear([{ type: 'attack_power', tier: 5, value: 15 }]), [
      { name: '精鍊印記', amount: 2 },
      { name: '突破印記', amount: 1 },
    ]);
    openTab('詞綴升階');

    expect(screen.getByText(/突破印記×1 · 10%/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '升階' }));

    expect(useGameStore.getState().inventory[0].affixes![0].tier).toBe(6);
    const bag = useGameStore.getState().bagItems;
    expect(bag.find(b => b.name === '突破印記')).toBeUndefined();
    expect(bag.find(b => b.name === '精鍊印記')?.amount).toBe(2);
  });

  it('商店裝到 T3 就沒有印記可用（§ 6A.6 硬上限）', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 11 }], { maxAffixTier: 3 }), [
      { name: '精鍊印記', amount: 5 },
      { name: '突破印記', amount: 5 },
    ]);
    openTab('詞綴升階');

    const btn = screen.getByRole('button', { name: '不可用' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('印記師 — 品質提升分頁', () => {
  it('消耗工藝印記 ×1 + 50,000G，品質 +1%', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '工藝印記', amount: 1 },
    ], 60_000);
    openTab('品質提升');

    expect(screen.getByText(new RegExp(`工藝印記×1 \\+ ${POLISH_SIGIL_GOLD_COST.toLocaleString()}G`))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '提升品質' }));

    expect(useGameStore.getState().inventory[0].quality).toBe(1);
    expect(useGameStore.getState().character!.gold).toBe(10_000);
    expect(useGameStore.getState().bagItems.find(b => b.name === '工藝印記')).toBeUndefined();
  });

  it('金幣不足時擋下', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }]), [
      { name: '工藝印記', amount: 1 },
    ], 100);
    openTab('品質提升');

    const btn = screen.getByRole('button', { name: '金幣不足' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('品質已滿 20% 不受理', () => {
    setup(gear([{ type: 'attack_power', tier: 3, value: 9 }], { quality: 20 }), [
      { name: '工藝印記', amount: 1 },
    ]);
    openTab('品質提升');

    const btn = screen.getByRole('button', { name: /品質已達 20%/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
