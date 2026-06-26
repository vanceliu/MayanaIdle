import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TownBlacksmith } from '../town/TownBlacksmith';
import { useGameStore } from '../../stores/gameStore';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { db } from '../../db/database';
import { loadTemplateCache } from '../../systems/templateSync';

/**
 * @vitest-environment jsdom
 */

describe('TownBlacksmith - Crafting', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resetSeedState();
    await seedDatabase();
    await loadTemplateCache();

    useGameStore.setState({
      character: {
        name: 'TestHero',
        className: 'knight',
        level: 30,
        exp: 0,
        expToNext: 5000,
        hp: 200,
        maxHp: 200,
        mp: 50,
        maxMp: 50,
        baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
        bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        gold: 500000,
        currentArea: 'neutral-town',
        currentZone: 'newbie-neutral',
        currentRegion: 'neutral-town',
        currentFloor: null,
        skills: [],
        unspentAttributePoints: 0,
        quests: [],
        areaEnteredAt: Date.now(),
        createdAt: Date.now(),
        userId: 1,
      },
      equippedGear: {},
      inventory: [],
      bagItems: [
        { name: '銀礦石', type: 'material', amount: 10 },
        { name: '銀精華', type: 'material', amount: 10 },
        { name: '品質石', type: 'material', amount: 10 },
      ],
    });
  });

  it('renders craft tab', () => {
    render(<TownBlacksmith />);
    expect(screen.getByText('裝備製作')).toBeDefined();
  });

  it('shows recipe list when craft tab selected', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    expect(await screen.findByText('精鋼劍')).toBeDefined();
    expect(screen.getByText('銀騎士之劍')).toBeDefined();
  });

  it('shows recipe detail when selected', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await screen.findByText('精鋼劍'));
    expect(screen.getAllByText(/150.*G/).length).toBeGreaterThan(0);
  });

  it('crafts item successfully when materials and gold available', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await screen.findByText('精鋼劍'));
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    const state = useGameStore.getState();
    expect(state.character!.gold).toBe(500000 - 150000);
    expect(state.inventory.some(i => i.name === '精鋼劍')).toBe(true);
    expect(state.bagItems.find(b => b.name === '銀礦石')?.amount).toBe(10 - 4);
    expect(state.bagItems.find(b => b.name === '銀精華')?.amount).toBe(10 - 3);
    expect(state.bagItems.find(b => b.name === '品質石')?.amount).toBe(10 - 3);
  });

  it('crafted item has correct stats', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await screen.findByText('精鋼劍'));
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    const state = useGameStore.getState();
    const crafted = state.inventory.find(i => i.name === '精鋼劍')!;
    expect(crafted.smallMonsterDamage).toBe(8);
    expect(crafted.largeMonsterDamage).toBe(6);
    expect(crafted.type).toBe('sword');
    expect(crafted.slot).toBe('rightHand');
    expect(crafted.quality).toBe(0);
    expect(crafted.enhancement).toBe(0);
    expect(crafted.stability).toBe(6);
    expect(Array.isArray(crafted.affixes)).toBe(true);
  });

  it('disables craft button when not enough gold', async () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 100 },
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    await screen.findByText('精鋼劍');
    fireEvent.click(screen.getByText('精鋼劍'));

    const craftBtns = screen.getAllByText('製作');
    expect(craftBtns.every(btn => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it('disables craft button when not enough materials', async () => {
    useGameStore.setState({
      bagItems: [
        { name: '銀礦石', type: 'material', amount: 1 },
        { name: '銀精華', type: 'material', amount: 1 },
        { name: '品質石', type: 'material', amount: 1 },
      ],
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    await screen.findByText('精鋼劍');
    fireEvent.click(screen.getByText('精鋼劍'));

    const craftBtns = screen.getAllByText('製作');
    expect(craftBtns.every(btn => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it('shows success message after crafting', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await screen.findByText('精鋼劍'));
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    expect(screen.getByText('製作成功！獲得 精鋼劍')).toBeDefined();
  });

  it('top-tier recipe has stability 0', async () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 2000000 },
      bagItems: [
        { name: '奧里哈魯根碎片', type: 'material', amount: 20 },
        { name: '奧里哈魯根精華', type: 'material', amount: 20 },
        { name: '龍心結晶', type: 'material', amount: 20 },
        { name: '米索利礦石', type: 'material', amount: 20 },
        { name: '品質石', type: 'material', amount: 20 },
      ],
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await screen.findByText('屠龍者'));
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    const state = useGameStore.getState();
    const crafted = state.inventory.find(i => i.name === '屠龍者')!;
    expect(crafted.stability).toBe(0);
  });
});
