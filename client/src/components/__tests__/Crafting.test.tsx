import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TownBlacksmith } from '../town/TownBlacksmith';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { useGameStore } from '../../stores/gameStore';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { db } from '../../db/database';
import { loadTemplateCache } from '../../systems/templateSync';

/**
 * @vitest-environment jsdom
 */

/**
 * 配方名稱在畫面上可能出現兩次：配方標題，以及其他配方的「前置武器」需求。
 * 這裡只取配方標題。
 */
async function findRecipeTitle(name: string): Promise<HTMLElement> {
  const matches = await screen.findAllByText(name);
  const title = matches.find(el => el.closest('.shop-item-name'));
  if (!title) throw new Error(`找不到配方標題: ${name}`);
  return title;
}

/** 鋼心劍的配方是測試的固定對象；材料由 seed 決定，不寫死在測試裡（§ 6A.3 會重新分配） */
const RECIPE = EQUIPMENT_SEEDS.find(t => t.name === '鋼心劍')!;
const recipeBagFor = (name: string, amount: number) =>
  EQUIPMENT_SEEDS.find(t => t.name === name)!.craftMaterials!
    .map(m => ({ name: m.name, type: 'material' as const, amount }));
const recipeBag = (amount: number) =>
  RECIPE.craftMaterials!.map(m => ({ name: m.name, type: 'material' as const, amount }));

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
      bagItems: recipeBag(10),
    });
  });

  it('renders craft tab', () => {
    render(<TownBlacksmith />);
    expect(screen.getByText('裝備製作')).toBeDefined();
  });

  it('shows recipe list when craft tab selected', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    expect(await findRecipeTitle('鋼心劍')).toBeDefined();
    expect(await findRecipeTitle('霜紋劍')).toBeDefined();
  });

  it('shows recipe detail when selected', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await findRecipeTitle('鋼心劍'));
    // 製作費由 § 6A.3 的階級表決定（T4 5 萬、T5 10 萬），不寫死在測試裡
    const recipe = EQUIPMENT_SEEDS.find(t => t.name === '鋼心劍')!;
    const priceText = new RegExp(recipe.craftGold!.toLocaleString().replace(/,/g, '.?'));
    expect(screen.getAllByText(priceText).length).toBeGreaterThan(0);
  });

  it('crafts item successfully when materials and gold available', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await findRecipeTitle('鋼心劍'));
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    const state = useGameStore.getState();
    const cost = EQUIPMENT_SEEDS.find(t => t.name === '鋼心劍')!.craftGold!;
    expect(state.character!.gold).toBe(500000 - cost);
    expect(state.inventory.some(i => i.name === '鋼心劍')).toBe(true);
    for (const m of RECIPE.craftMaterials!) {
      expect(state.bagItems.find(b => b.name === m.name)?.amount, m.name).toBe(10 - m.amount);
    }
  });

  it('crafted item has correct stats', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await findRecipeTitle('鋼心劍'));
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    const state = useGameStore.getState();
    const crafted = state.inventory.find(i => i.name === '鋼心劍')!;
    // 素質對照 seed 而非寫死數字 —— 寫死會讓每次數值調整都要改測試，
    // 而這個測試要驗的是「製作出來的實例有正確繼承模板」，不是特定數值
    const template = EQUIPMENT_SEEDS.find(t => t.name === '鋼心劍')!;
    expect(crafted.smallMonsterDamage).toBe(template.smallMonsterDamage);
    expect(crafted.largeMonsterDamage).toBe(template.largeMonsterDamage);
    expect(crafted.extraAttack).toBe(template.extraAttack);
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
    fireEvent.click(await findRecipeTitle('鋼心劍'));

    const craftBtns = screen.getAllByText('製作');
    expect(craftBtns.every(btn => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it('disables craft button when not enough materials', async () => {
    useGameStore.setState({
      bagItems: recipeBag(1),
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await findRecipeTitle('鋼心劍'));

    const craftBtns = screen.getAllByText('製作');
    expect(craftBtns.every(btn => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it('shows success message after crafting', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await findRecipeTitle('鋼心劍'));
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    expect(screen.getByText('製作成功！獲得 鋼心劍')).toBeDefined();
  });

  it('製作品的安定值繼承自模板', async () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 2000000 },
      bagItems: [
        ...recipeBagFor('碎星劍', 30),
      ],
      inventory: [
        { id: 9001, templateId: 0, name: '鋼心劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, quality: 0, enhancement: 0, stability: 6, affixes: [], ownerId: 1, equipped: false } as any,
      ],
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click((await screen.findAllByText('碎星劍'))[0]);
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    await waitFor(() => {
      const state = useGameStore.getState();
      const crafted = state.inventory.find(i => i.name === '碎星劍')!;
      // 安定值已統一（武器 6／副手 4），不再有頂級 = 0 的特例；對照模板而非寫死
      const template = EQUIPMENT_SEEDS.find(t => t.name === '碎星劍')!;
      expect(crafted.stability).toBe(template.stability);
    });
  });

  it('disables craft button when prerequisite weapon is missing', async () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 2000000 },
      bagItems: [
        ...recipeBagFor('碎星劍', 30),
      ],
      inventory: [],
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click((await screen.findAllByText('碎星劍'))[0]);

    const craftBtns = screen.getAllByText('製作');
    expect(craftBtns.every(btn => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it('prerequisite weapon with enhancement/affixes can still be used as material', async () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 2000000 },
      bagItems: [
        ...recipeBagFor('碎星劍', 30),
      ],
      inventory: [
        { id: 9002, templateId: 0, name: '鋼心劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, quality: 15, enhancement: 6, stability: 6, affixes: [{ id: 'atk1', tier: 2, value: 5 }], ownerId: 1, equipped: false } as any,
      ],
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click((await screen.findAllByText('碎星劍'))[0]);
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    await waitFor(() => {
      const state = useGameStore.getState();
      const crafted = state.inventory.find(i => i.name === '碎星劍');
      expect(crafted).toBeDefined();
      expect(state.inventory.find(i => i.name === '霜紋劍')).toBeUndefined();
    });
  });

  it('dual blade craft consumes prerequisite T4 dual blade', async () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 500000, className: 'thief' },
      bagItems: recipeBagFor('月牙雙刀', 10),
      inventory: [
        { id: 9003, templateId: 0, name: '烈風連刃', type: 'dualBlade', slot: 'rightHand', isTwoHanded: false, quality: 0, enhancement: 0, stability: 6, affixes: [], ownerId: 1, equipped: false } as any,
        { id: 9004, templateId: 0, name: '烈風連刃', type: 'dualBlade', slot: 'rightHand', isTwoHanded: false, quality: 0, enhancement: 0, stability: 6, affixes: [], ownerId: 1, equipped: false } as any,
      ],
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await screen.findByText('雙刀'));
    fireEvent.click((await screen.findAllByText('月牙雙刀'))[0]);
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    await waitFor(() => {
      const state = useGameStore.getState();
      expect(state.inventory.find(i => i.name === '月牙雙刀')).toBeDefined();
      expect(state.inventory.filter(i => i.name === '烈風連刃').length).toBe(1);
    });
  });
});
