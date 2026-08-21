import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TownBlacksmith } from '../town/TownBlacksmith';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { useGameStore } from '../../stores/gameStore';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { db } from '../../db/database';
import { loadTemplateCache } from '../../systems/templateSync';
import { bagItemById } from '../../testing/bagFixtures';

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
    .map(m => bagItemById(m.itemId, amount));
const recipeBag = (amount: number) =>
  RECIPE.craftMaterials!.map(m => bagItemById(m.itemId, amount));

/**
 * 背包裡的一件裝備實例。**`templateId` 一律由 seed 反查**，不可寫死或填 0 ——
 * 前置武器判定已改成比對 `templateId`（§ 99.1 第 3 條），填 0 的 fixture
 * 會讓所有前置需求都不成立。名稱只是 fixture 的可讀性，不參與判定。
 */
function equipFixture(
  name: string,
  id: number,
  extra: Partial<Record<string, unknown>> = {},
) {
  const tmpl = EQUIPMENT_SEEDS.find(t => t.name === name)!;
  return {
    id,
    templateId: tmpl.id!,
    name: tmpl.name,
    type: tmpl.type,
    slot: tmpl.slot,
    isTwoHanded: tmpl.isTwoHanded,
    quality: 0,
    enhancement: 0,
    stability: tmpl.stability,
    affixes: [],
    ownerId: 1,
    equipped: false,
    ...extra,
  } as never;
}

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
      craftQuests: [],
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

  /** 每個有製作配方的防具部位都必須有分類按鈕，否則配方永遠沒有入口（§ 6A.7） */
  it('每個可製作的防具部位都有分類按鈕', async () => {
    const SLOT_LABELS: Record<string, string> = {
      helmet: '頭盔', chest: '胸甲', gloves: '手套', boots: '鞋子',
      belt: '腰帶', necklace: '項鍊', ring1: '戒指',
    };
    const craftableSlots = new Set(
      EQUIPMENT_SEEDS
        .filter(t => t.type === 'armor' && t.acquireType === 'craft' && t.slot)
        .map(t => t.slot as string),
    );
    expect(craftableSlots.size).toBeGreaterThan(0);

    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    for (const slot of craftableSlots) {
      expect(await screen.findByText(SLOT_LABELS[slot]), slot).toBeDefined();
    }
  });

  it('腰帶分類列出 T4／T5 製作配方（§ 6A.7）', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await screen.findByText('腰帶'));
    expect(await findRecipeTitle('銀扣腰帶')).toBeDefined();
    expect(await findRecipeTitle('力之腰帶')).toBeDefined();
  });

  it('shows recipe detail when selected', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await findRecipeTitle('鋼心劍'));
    // 需求只有素材與前置，配方卡片不顯示金幣（§ 6A.3）
    for (const m of RECIPE.craftMaterials!) {
      expect(screen.getAllByText(`10/${m.amount}`).length).toBeGreaterThan(0);
    }
  });

  it('crafts item successfully when materials available', async () => {
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await findRecipeTitle('鋼心劍'));
    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    const state = useGameStore.getState();
    // 製作不收金幣（§ 6A.3）
    expect(state.character!.gold).toBe(500000);
    expect(state.inventory.some(i => i.name === '鋼心劍')).toBe(true);
    for (const m of RECIPE.craftMaterials!) {
      expect(state.bagItems.find(b => b.itemId === m.itemId)?.amount, String(m.itemId)).toBe(10 - m.amount);
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

  it('金幣為 0 一樣做得出來（製作不收費，§ 6A.3）', async () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 0 },
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click(await findRecipeTitle('鋼心劍'));

    const craftBtns = screen.getAllByText('製作');
    const enabledBtn = craftBtns.find(btn => !(btn as HTMLButtonElement).disabled)!;
    fireEvent.click(enabledBtn);

    const state = useGameStore.getState();
    expect(state.character!.gold).toBe(0);
    expect(state.inventory.some(i => i.name === '鋼心劍')).toBe(true);
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
        equipFixture('鋼心劍', 9001),
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
        equipFixture('鋼心劍', 9002, { quality: 15, enhancement: 6, affixes: [{ id: 'atk1', tier: 2, value: 5 }] }),
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

  /**
   * § 99.1 第 3 條的回歸測試：判定的依據是 `templateId` 而不是名稱。
   * 名稱對、templateId 不對的實例（seed 換過 id 之後留在玩家 IndexedDB 的舊列）
   * 不可以被當成前置武器 —— 一旦採信，製作流程會刪掉一件不是配方要的裝備。
   */
  it('名稱相符但 templateId 不符的裝備不算前置武器', async () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 2000000 },
      bagItems: [...recipeBagFor('碎星劍', 30)],
      inventory: [
        // 名字是「鋼心劍」，templateId 卻指向別的模板
        { ...equipFixture('鋼心劍', 9005) as object, templateId: 999999 } as never,
      ],
    });
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByText('裝備製作'));
    fireEvent.click((await screen.findAllByText('碎星劍'))[0]);

    const craftBtns = screen.getAllByText('製作');
    expect(craftBtns.every(btn => (btn as HTMLButtonElement).disabled)).toBe(true);
    // 那件同名裝備必須原封不動留著
    expect(useGameStore.getState().inventory).toHaveLength(1);
  });

  /**
   * 反向：templateId 相符時，即使實例上的名稱是舊名（裝備改名前存下的），
   * 仍然算數。這是改用 id 換來的好處，不是副作用。
   */
  it('templateId 相符時，實例名稱過期仍算前置武器', async () => {
    const prereqId = EQUIPMENT_SEEDS.find(t => t.name === '碎星劍')!.craftPrerequisiteWeapon!.templateId;
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 2000000 },
      bagItems: [...recipeBagFor('碎星劍', 30)],
      inventory: [
        { ...equipFixture('鋼心劍', 9006) as object, templateId: prereqId, name: '鋼心劍（舊名）' } as never,
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
      expect(state.inventory.find(i => i.name === '碎星劍')).toBeDefined();
      expect(state.inventory.find(i => i.name === '鋼心劍（舊名）')).toBeUndefined();
    });
  });

  it('dual blade craft consumes prerequisite T4 dual blade', async () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: 500000, className: 'thief' },
      bagItems: recipeBagFor('月牙雙刀', 10),
      inventory: [
        equipFixture('烈風連刃', 9003),
        equipFixture('烈風連刃', 9004),
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

  /** 製作追蹤（`36-quest-system.md` § 36.13） */
  describe('製作追蹤', () => {
    it('加入追蹤後任務只存 templateId，按鈕改為取消追蹤', async () => {
      render(<TownBlacksmith />);
      fireEvent.click(screen.getByText('裝備製作'));
      fireEvent.click(await findRecipeTitle('鋼心劍'));

      fireEvent.click(screen.getAllByText('製作追蹤')[0]);

      const quests = useGameStore.getState().craftQuests;
      expect(quests).toHaveLength(1);
      expect(quests[0].templateId).toBe(RECIPE.id);
      expect(await screen.findByText('取消追蹤')).toBeTruthy();
    });

    it('滿 3 個後製作追蹤按鈕全部 disabled（§ 36.13.2）', async () => {
      useGameStore.setState({
        craftQuests: [
          { id: 'craft-1', templateId: 1 },
          { id: 'craft-2', templateId: 2 },
          { id: 'craft-3', templateId: 3 },
        ],
      });
      render(<TownBlacksmith />);
      fireEvent.click(screen.getByText('裝備製作'));
      await findRecipeTitle('鋼心劍');

      const btns = screen.getAllByText('製作追蹤');
      expect(btns.every(b => (b as HTMLButtonElement).disabled)).toBe(true);
    });

    it('取消追蹤移除任務', async () => {
      useGameStore.setState({ craftQuests: [{ id: `craft-${RECIPE.id}`, templateId: RECIPE.id! }] });
      render(<TownBlacksmith />);
      fireEvent.click(screen.getByText('裝備製作'));
      await findRecipeTitle('鋼心劍');

      fireEvent.click(screen.getByText('取消追蹤'));

      expect(useGameStore.getState().craftQuests).toHaveLength(0);
    });

    it('製作成功後自動移除同配方的任務（§ 36.13.5）', async () => {
      useGameStore.setState({ craftQuests: [{ id: `craft-${RECIPE.id}`, templateId: RECIPE.id! }] });
      render(<TownBlacksmith />);
      fireEvent.click(screen.getByText('裝備製作'));
      fireEvent.click(await findRecipeTitle('鋼心劍'));
      const enabledBtn = screen.getAllByText('製作').find(btn => !(btn as HTMLButtonElement).disabled)!;
      fireEvent.click(enabledBtn);

      await waitFor(() => {
        expect(useGameStore.getState().inventory.some(i => i.name === '鋼心劍')).toBe(true);
      });
      expect(useGameStore.getState().craftQuests).toHaveLength(0);
    });

    it('沒加進追蹤就直接製作時不影響其他任務', async () => {
      useGameStore.setState({ craftQuests: [{ id: 'craft-999', templateId: 999 }] });
      render(<TownBlacksmith />);
      fireEvent.click(screen.getByText('裝備製作'));
      fireEvent.click(await findRecipeTitle('鋼心劍'));
      const enabledBtn = screen.getAllByText('製作').find(btn => !(btn as HTMLButtonElement).disabled)!;
      fireEvent.click(enabledBtn);

      await waitFor(() => {
        expect(useGameStore.getState().inventory.some(i => i.name === '鋼心劍')).toBe(true);
      });
      expect(useGameStore.getState().craftQuests).toEqual([{ id: 'craft-999', templateId: 999 }]);
    });
  });
});
