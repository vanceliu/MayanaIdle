// @vitest-environment jsdom
/**
 * 獨特製作（`06-equipment-acquire.md` § 6A.3.1、§ 6A.6「製作品 (獨)」、§ 6A.3「拆解」；
 * `46-sigil.md` § 46.9；`07-affix-ability.md` § 7S.8；`36-quest-system.md` § 36.13）
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { useGameStore, type CraftResult } from '../../stores/gameStore';
import { resetTestDb } from '../../testing/testDb';
import { loadTemplateCache, resolveEquipment } from '../../systems/templateSync';
import { bagItemById } from '../../testing/bagFixtures';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { UNIQUE_CRAFTED_GEAR_SUFFIX, type EquipmentInstance, type EquipmentTemplate } from '../../models/equipment';
import { isSpecialAffixType, isTierlessAffixType, type Affix } from '../../models/affix';
import { SIGIL_DEFINITIONS, UNIQUE_CRAFTED_GEAR_SIGIL_REASON, type SigilType } from '../../models/sigil';
import { makeBagItem, getBagItemAmount } from '../../models/bagItem';
import { getBagMaxSlots } from '../../systems/bagCapacity';
import { CRYSTAL_APPLY_BLOCK_TEXT, type AbilityCrystal } from '../../models/abilityCrystal';
import { craftRequiresAbility } from '../../models/ability';
import { getItemById } from '../../models/items';
import { TownBlacksmith } from '../../components/town/TownBlacksmith';
import { QuestTrackerContent } from '../../components/QuestTracker';

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

/** T5 武器：有一般前置（不同模板），獨特製作不要求 */
const RECIPE = EQUIPMENT_SEEDS.find(t => t.tier === 5 && t.slot === 'rightHand' && t.craftPrerequisiteWeapon && t.uniqueCraftMaterials)!;
const UNIQUE_MATS = RECIPE.uniqueCraftMaterials!;
const GOLD = RECIPE.craftGold!;
const AFFIXES: Affix[] = [{ type: 'attack_power', tier: 4, value: 12 }];

const character = (gold = GOLD, id?: number) => ({
  name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
  baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
  bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  gold, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
  currentFloor: null, skills: [], quests: [], unspentAttributePoints: 0, areaEnteredAt: 0, createdAt: 0, userId: 1,
  ...(id != null ? { id } : {}),
}) as never;

function gear(id: number, over: Partial<EquipmentInstance> = {}, tpl: EquipmentTemplate = RECIPE): EquipmentInstance {
  return resolveEquipment({
    id, templateId: tpl.id!, name: tpl.name, type: tpl.type, slot: tpl.slot, isTwoHanded: tpl.isTwoHanded,
    quality: 0, enhancement: 0, affixes: AFFIXES, affixSlots: 4, ownerId: 1, equipped: false, ...over,
  } as EquipmentInstance);
}

function setup(over: Record<string, unknown> = {}) {
  useGameStore.setState({
    character: character(), equippedGear: {}, craftQuests: [],
    bagItems: UNIQUE_MATS.map(m => bagItemById(m.itemId, m.amount)),
    inventory: [gear(11)],
    personalStoredMaterials: [], personalStoredEquipment: [],
    storedMaterials: [], storedEquipment: [],
    abilityCrystals: [],
    ...over,
  });
}

const craft = (templateId: unknown = RECIPE.id, prereqId: unknown = 11) =>
  Promise.resolve(useGameStore.getState().craftUniqueEquipment(templateId as number, prereqId as number));

beforeEach(async () => {
  resetTestDb();
  await loadTemplateCache();
});
afterEach(() => vi.restoreAllMocks());

describe('獨特製作：成功', () => {
  it('扣獨特材料（背包 → 個人 → 帳號倉庫）、前置與製作費，產物為 (獨)', async () => {
    const [first, ...rest] = UNIQUE_MATS;
    setup({
      bagItems: [bagItemById(first.itemId, 1), ...rest.map(m => bagItemById(m.itemId, m.amount))],
      personalStoredMaterials: [bagItemById(first.itemId, 1)],
      storedMaterials: [bagItemById(first.itemId, first.amount)],
      inventory: [],
      storedEquipment: [gear(12, { inStorage: true, storageType: 'shared', enhancement: 7 })],
      craftQuests: [{ id: `craft-${RECIPE.id}`, templateId: RECIPE.id! }, { id: `craft-unique-${RECIPE.id}`, templateId: RECIPE.id!, unique: true }],
    });
    const result = await craft(RECIPE.id, 12);
    expect(result.ok).toBe(true);
    const s = useGameStore.getState();
    expect(getBagItemAmount(s.bagItems, first.itemId)).toBe(0);
    expect(getBagItemAmount(s.personalStoredMaterials, first.itemId)).toBe(0);
    expect(getBagItemAmount(s.storedMaterials, first.itemId)).toBe(2);
    expect(s.storedEquipment).toEqual([]);
    expect(s.character!.gold).toBe(0);
    const made = s.inventory[0];
    expect(made.isUniqueCraftedGear).toBe(true);
    expect(made.isCraftedGear).toBeUndefined();
    expect(made.name).toBe(`${RECIPE.name}${UNIQUE_CRAFTED_GEAR_SUFFIX}`);
    expect(result.message).toContain(made.name);
    expect(made.quality).toBe(0);
    expect(made.enhancement).toBe(0);
    expect(made.affixes).toHaveLength(4);
    expect(made.affixes.some(a => isSpecialAffixType(a.type))).toBe(false);
    const tiered = made.affixes.filter(a => !isTierlessAffixType(a.type));
    expect(tiered.filter(a => a.tier === 6)).toHaveLength(Math.min(1, tiered.length));
    expect(craftRequiresAbility(RECIPE)).toBe(true);
    expect(made.ability).toBeDefined();
    // § 36.13.5：只移除獨特配方的追蹤
    expect(s.craftQuests).toEqual([{ id: `craft-${RECIPE.id}`, templateId: RECIPE.id! }]);
  });

  it('(鍛)、商店品、掉落品都可當前置', async () => {
    for (const over of [{ isCraftedGear: true }, { maxAffixTier: 3 }, {}]) {
      setup({ inventory: [gear(11, over)] });
      expect((await craft()).ok).toBe(true);
    }
  });

  it('重複 resolve 不疊後綴；同模板的掉落品沒有後綴', () => {
    expect(resolveEquipment(gear(1, { isUniqueCraftedGear: true })).name).toBe(`${RECIPE.name}${UNIQUE_CRAFTED_GEAR_SUFFIX}`);
    expect(gear(2).name).toBe(RECIPE.name);
  });
});

describe('獨特製作：拒絕（不扣任何東西）', () => {
  async function expectRejected(message: string, templateId?: unknown, prereqId?: unknown) {
    const before = useGameStore.getState();
    const result = await craft(templateId ?? RECIPE.id, prereqId ?? 11);
    expect(result).toEqual({ ok: false, message });
    const after = useGameStore.getState();
    expect(after.bagItems).toEqual(before.bagItems);
    expect(after.inventory).toEqual(before.inventory);
    expect(after.character!.gold).toBe(before.character!.gold);
  }

  it('配方參數不合格或模板沒有獨特配方', async () => {
    setup();
    await expectRejected('無此配方', '1');
    await expectRejected('無此配方', 1.5);
    const noRecipe = EQUIPMENT_SEEDS.find(t => !t.uniqueCraftMaterials)!;
    await expectRejected('無此配方', noRecipe.id);
  });

  it('材料不足（公會倉庫不算）', async () => {
    setup({ bagItems: UNIQUE_MATS.slice(1).map(m => bagItemById(m.itemId, m.amount)) });
    await expectRejected('材料不足');
  });

  it('沒有可用的前置：只有 (獨)、(擬) 或身上裝備', async () => {
    setup({
      inventory: [gear(11, { isUniqueCraftedGear: true }), gear(12, { isMimicGear: true })],
      equippedGear: { rightHand: gear(13, { equipped: true }) },
    });
    await expectRejected('沒有可用的前置裝備');
  });

  it('金幣不足（帳號倉庫金幣不算）', async () => {
    setup({ character: character(GOLD - 1) });
    await expectRejected('金幣不足');
  });

  it('背包已滿', async () => {
    const max = getBagMaxSlots({});
    setup({ inventory: [gear(11), ...Array.from({ length: max }, (_, i) => gear(100 + i))] });
    await expectRejected('背包已滿');
  });

  it('前置參數不合格、不存在或模板不同', async () => {
    const other = EQUIPMENT_SEEDS.find(t => t.id === RECIPE.craftPrerequisiteWeapon!.templateId)!;
    setup({ inventory: [gear(11), gear(12, {}, other)] });
    await expectRejected('請選擇前置裝備', RECIPE.id, '11');
    await expectRejected('請選擇前置裝備', RECIPE.id, 999);
    await expectRejected('請選擇前置裝備', RECIPE.id, 12);
  });

  it('指定 (獨)、(擬) 當前置', async () => {
    setup({ inventory: [gear(11), gear(12, { isUniqueCraftedGear: true }), gear(13, { isMimicGear: true })] });
    await expectRejected('獨特製作品不可用', RECIPE.id, 12);
    await expectRejected('擬態品不可用', RECIPE.id, 13);
  });
});

describe('(獨) 製作品不可使用印記', () => {
  for (const type of SIGIL_DEFINITIONS.map(d => d.type)) {
    it(`${type}：不受理、不扣印記`, () => {
      useGameStore.setState({
        character: character(1_000_000, 1),
        bagItems: SIGIL_DEFINITIONS.map(d => makeBagItem(d.itemId, 1)!),
        inventory: [gear(7, { isUniqueCraftedGear: true })],
        equippedGear: {},
      });
      const res = useGameStore.getState().applySigil(7, type as SigilType, type === 'chaos' || type === 'add' || type === 'polish' ? null : 0) as CraftResult;
      expect(res).toEqual({ ok: false, message: UNIQUE_CRAFTED_GEAR_SIGIL_REASON });
      expect(getBagItemAmount(useGameStore.getState().bagItems, SIGIL_DEFINITIONS.find(d => d.type === type)!.itemId)).toBe(1);
    });
  }
});

describe('(獨) 製作品的拆解與技能更換', () => {
  const ability = { type: 'bonus_damage' as const, params: { chance: 10, damage: 5 } };

  it('退一般配方 100%、獨特材料不退、不出技能結晶', async () => {
    setup({ bagItems: [], inventory: [gear(7, { isUniqueCraftedGear: true, ability })] });
    const result = await useGameStore.getState().dismantleEquipment(7);
    expect(result.ok).toBe(true);
    const s = useGameStore.getState();
    for (const m of RECIPE.craftMaterials!) expect(getBagItemAmount(s.bagItems, m.itemId)).toBe(m.amount);
    for (const m of UNIQUE_MATS) expect(getBagItemAmount(s.bagItems, m.itemId)).toBe(0);
    expect(s.abilityCrystals).toEqual([]);
    expect(s.inventory).toEqual([]);
  });

  it('技能更換不受理', async () => {
    const crystal: AbilityCrystal = { type: 'bonus_damage', positions: { chance: 1, damage: 1 } } as AbilityCrystal;
    setup({ inventory: [gear(7, { isUniqueCraftedGear: true, ability })], abilityCrystals: [crystal], character: character(10_000_000) });
    const result = await useGameStore.getState().applyAbilityCrystal(7, 'bonus_damage');
    expect(result).toEqual({ ok: false, message: CRYSTAL_APPLY_BLOCK_TEXT.uniqueCrafted });
    expect(useGameStore.getState().inventory[0].ability).toEqual(ability);
  });
});

describe('製作追蹤：獨特配方與一般配方分開', () => {
  it('同模板可各追蹤一張，參數不合格不寫', () => {
    setup();
    const s = useGameStore.getState();
    s.acceptCraftQuest(RECIPE.id!);
    s.acceptCraftQuest(RECIPE.id!, true);
    s.acceptCraftQuest(RECIPE.id!, true);
    s.acceptCraftQuest('x' as never, true);
    s.acceptCraftQuest(RECIPE.id!, 'yes' as never);
    expect(useGameStore.getState().craftQuests).toEqual([
      { id: `craft-${RECIPE.id}`, templateId: RECIPE.id },
      { id: `craft-unique-${RECIPE.id}`, templateId: RECIPE.id, unique: true },
    ]);
  });

  it('追蹤視窗標題加 (獨)，需求為獨特材料＋同模板 ×1＋製作費', () => {
    setup({ craftQuests: [{ id: `craft-unique-${RECIPE.id}`, templateId: RECIPE.id!, unique: true }] });
    render(<QuestTrackerContent />);
    const card = screen.getByText(`${RECIPE.name}${UNIQUE_CRAFTED_GEAR_SUFFIX}`).closest('.quest-tracker-item') as HTMLElement;
    expect(card.className).toContain('completable');
    expect(within(card).getByText(RECIPE.name, { exact: false, selector: '.tracker-craft-req' })).toBeTruthy();
    for (const m of UNIQUE_MATS) expect(within(card).getByText(getItemById(m.itemId)!.name, { exact: false })).toBeTruthy();
  });
});

describe('鐵匠鋪「獨特製作」分頁', () => {
  function openUniqueTab() {
    render(<TownBlacksmith />);
    const tabs = screen.getAllByRole('button').filter(b => b.closest('.shop-tabs'));
    expect(tabs.map(b => b.textContent)).toEqual(['裝備製作', '獨特製作', '裝備拆解', '技能更換']);
    fireEvent.click(screen.getByRole('button', { name: '獨特製作' }));
    fireEvent.click(screen.getByRole('button', { name: '單手劍' }));
  }

  it('挑選視窗灰階列出 (獨)、(擬)；確認視窗列出前置後製作', async () => {
    expect(RECIPE.type).toBe('sword');
    setup({ inventory: [gear(11, { enhancement: 3 }), gear(12, { isUniqueCraftedGear: true }), gear(13, { isMimicGear: true })] });
    openUniqueTab();
    const card = screen.getAllByText(RECIPE.name).find(el => el.closest('.shop-item-name'))!.closest('.shop-item') as HTMLElement;
    fireEvent.click(card);
    fireEvent.click(within(card).getByRole('button', { name: '選擇' }));
    const dialog = screen.getByRole('dialog', { name: '選擇前置裝備' });
    const radios = within(dialog).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(within(radios[1]).getByText('獨特製作品不可用')).toBeTruthy();
    expect(within(radios[2]).getByText('擬態品不可用')).toBeTruthy();
    fireEvent.click(radios[1]);
    expect(screen.getByRole('dialog', { name: '選擇前置裝備' })).toBeTruthy();
    fireEvent.click(radios[0]);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(within(card).getByRole('button', { name: '製作' }));
    expect(confirm.mock.calls[0][0]).toContain(`${RECIPE.name} +3`);
    await waitFor(() => expect(useGameStore.getState().inventory.some(i => i.isUniqueCraftedGear)).toBe(true));
  });
});
