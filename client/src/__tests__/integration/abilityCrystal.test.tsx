// @vitest-environment jsdom
/**
 * 技能結晶與技能更換（`07-affix-ability.md` § 7S.8、`06-equipment-acquire.md` § 6A.3「拆解」）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useGameStore } from '../../stores/gameStore';
import { resetTestDb } from '../../testing/testDb';
import { loadTemplateCache, resolveEquipment } from '../../systems/templateSync';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { getBagItemAmount } from '../../models/bagItem';
import { getDismantleYield } from '../../systems/crafting';
import { getAbilityWeaponValue, type Ability } from '../../models/ability';
import type { AbilityCrystal } from '../../models/abilityCrystal';
import { TownBlacksmith } from '../../components/town/TownBlacksmith';

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

const knightCan = (t: EquipmentTemplate) => !t.requiredClass?.length || t.requiredClass.includes('knight');
const T7_SWORD = EQUIPMENT_SEEDS.find(t => t.tier === 7 && t.slot === 'rightHand' && knightCan(t))!;
const T4_SWORD = EQUIPMENT_SEEDS.find(t => t.acquireType === 'craft' && t.tier === 4 && t.slot === 'rightHand' && knightCan(t))!;
const T5_RING = EQUIPMENT_SEEDS.find(t => t.tier === 5 && t.slot === 'ring1')!;
const ELF_BOW = EQUIPMENT_SEEDS.find(t => t.tier === 5 && t.type === 'bow' && !!t.requiredClass?.length && !t.requiredClass.includes('knight'))!;
const SHOP_SWORD = EQUIPMENT_SEEDS.find(t => t.acquireType === 'shop' && t.tier === 3 && t.slot === 'rightHand')!;

const BEST_BONUS: Ability = { type: 'bonus_damage', params: { chance: 10, damage: getAbilityWeaponValue(T7_SWORD) } };

const character = (gold = 0) => ({
  name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
  baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
  bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  gold, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
  currentFloor: null, skills: [], quests: [], unspentAttributePoints: 0, areaEnteredAt: 0, createdAt: 0, userId: 1,
}) as never;

function instance(tpl: EquipmentTemplate, id: number, over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return resolveEquipment({
    id, templateId: tpl.id!, name: tpl.name, type: tpl.type, slot: tpl.slot, isTwoHanded: tpl.isTwoHanded,
    quality: 0, enhancement: 0, affixes: [], affixSlots: 4, ownerId: 1, equipped: false, ...over,
  } as EquipmentInstance);
}

function setup(inventory: EquipmentInstance[], over: Record<string, unknown> = {}) {
  useGameStore.setState({
    character: character(), inventory, bagItems: [], equippedGear: {}, abilityCrystals: [], craftQuests: [], ...over,
  });
}

beforeEach(async () => {
  resetTestDb();
  await loadTemplateCache();
});

describe('拆解出技能結晶', () => {
  it('無配方的掉落品帶技能：可拆，只得結晶', async () => {
    setup([instance(T7_SWORD, 7, { ability: BEST_BONUS })]);
    const result = await useGameStore.getState().dismantleEquipment(7);
    expect(result.ok).toBe(true);
    const s = useGameStore.getState();
    expect(s.inventory).toHaveLength(0);
    expect(s.bagItems).toHaveLength(0);
    expect(s.abilityCrystals).toEqual([{ type: 'bonus_damage', positions: { chance: 1, damage: 1 } }]);
  });

  it('有配方的掉落品：退材料並得結晶', async () => {
    setup([instance(T4_SWORD, 7, { ability: { type: 'bonus_damage', params: { chance: 5, damage: 5 } } })]);
    await useGameStore.getState().dismantleEquipment(7);
    const s = useGameStore.getState();
    for (const m of getDismantleYield(T4_SWORD)!) expect(getBagItemAmount(s.bagItems, m.itemId)).toBe(m.amount);
    expect(s.abilityCrystals.map(c => c.type)).toEqual(['bonus_damage']);
  });

  it('製作品只退材料，不出結晶', async () => {
    setup([instance(T4_SWORD, 7, { isCraftedGear: true, ability: BEST_BONUS })]);
    await useGameStore.getState().dismantleEquipment(7);
    expect(useGameStore.getState().abilityCrystals).toEqual([]);
  });

  it('商店裝帶技能仍不可拆', async () => {
    setup([instance(SHOP_SWORD, 7, { maxAffixTier: 3, ability: BEST_BONUS })]);
    const result = await useGameStore.getState().dismantleEquipment(7);
    expect(result).toMatchObject({ ok: false, message: '這件裝備無法拆解' });
    expect(useGameStore.getState().inventory).toHaveLength(1);
  });

  it('同種類每個參數各取較好的位置', async () => {
    const existing: AbilityCrystal = { type: 'bonus_damage', positions: { chance: 0, damage: 1 } };
    setup([instance(T7_SWORD, 7, { ability: { type: 'bonus_damage', params: { chance: 10, damage: 5 } } })], {
      abilityCrystals: [existing],
    });
    await useGameStore.getState().dismantleEquipment(7);
    expect(useGameStore.getState().abilityCrystals).toEqual([{ type: 'bonus_damage', positions: { chance: 1, damage: 1 } }]);
  });
});

describe('applyAbilityCrystal', () => {
  const BEST: AbilityCrystal = { type: 'bonus_damage', positions: { chance: 1, damage: 1 } };
  const COST_T4 = 6_000_000;

  it('換算到目標區間、扣金幣、結晶不消耗', async () => {
    setup([instance(T4_SWORD, 7)], { character: character(COST_T4 + 1), abilityCrystals: [BEST] });
    const result = await useGameStore.getState().applyAbilityCrystal(7, 'bonus_damage');
    expect(result.ok).toBe(true);
    const s = useGameStore.getState();
    expect(s.inventory[0].ability).toEqual({ type: 'bonus_damage', params: { chance: 10, damage: getAbilityWeaponValue(T4_SWORD) } });
    expect(s.character!.gold).toBe(1);
    expect(s.abilityCrystals).toEqual([BEST]);
  });

  it('原本的技能被取代', async () => {
    setup([instance(T5_RING, 7, { ability: { type: 'rage', params: { decay: 15 } } })], {
      character: character(10_000_000), abilityCrystals: [{ type: 'thorns', positions: { percent: 0.5 } }],
    });
    await useGameStore.getState().applyAbilityCrystal(7, 'thorns');
    expect(useGameStore.getState().inventory[0].ability).toEqual({ type: 'thorns', params: { percent: 40 } });
  });

  it.each([
    ['金幣不足', instance(T4_SWORD, 7), COST_T4 - 1, BEST, '金幣不足'],
    ['製作品', instance(T4_SWORD, 7, { isCraftedGear: true }), COST_T4, BEST, '製作品不能套用'],
    ['技能組不符', instance(T5_RING, 7), 10_000_000, BEST, '武器技能只能套用到武器，飾品技能只能套用到項鍊或戒指'],
    ['職業不能裝備', instance(ELF_BOW, 7), 10_000_000, { type: 'rend_boost', positions: { percent: 1 } }, '該職業無法裝備這件裝備'],
  ] as const)('%s：拒絕且不扣金幣', async (_label, item, gold, crystal, message) => {
    setup([item], { character: character(gold), abilityCrystals: [crystal] });
    const result = await useGameStore.getState().applyAbilityCrystal(7, crystal.type);
    expect(result).toMatchObject({ ok: false, message });
    expect(useGameStore.getState().character!.gold).toBe(gold);
    expect(useGameStore.getState().inventory[0].ability).toBe(item.ability);
  });

  it('沒有該結晶、身上的裝備不受理', async () => {
    setup([instance(T4_SWORD, 7)], { character: character(COST_T4) });
    expect((await useGameStore.getState().applyAbilityCrystal(7, 'bonus_damage')).ok).toBe(false);
    const worn = instance(T4_SWORD, 8, { equipped: true });
    setup([], { character: character(COST_T4), abilityCrystals: [BEST], equippedGear: { rightHand: worn } });
    expect((await useGameStore.getState().applyAbilityCrystal(8, 'bonus_damage')).ok).toBe(false);
  });
});

describe('鐵匠鋪 UI', () => {
  it('拆解清單標示新結晶，無配方的掉落品寫不退材料', () => {
    setup([instance(T7_SWORD, 7, { ability: BEST_BONUS })]);
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByRole('button', { name: '裝備拆解' }));
    expect(screen.getByText('不退材料')).toBeTruthy();
    expect(screen.getByText('技能結晶：追加傷害')).toBeTruthy();
    expect(screen.getByText('（新）')).toBeTruthy();
  });

  it('技能更換：選結晶、點裝備才顯示更換後，確認後套用', async () => {
    setup([instance(T4_SWORD, 7)], {
      character: character(6_000_000), abilityCrystals: [{ type: 'bonus_damage', positions: { chance: 1, damage: 1 } }],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByRole('button', { name: '技能更換' }));
    fireEvent.click(screen.getByRole('button', { name: '追加傷害' }));
    const apply = screen.getByRole('button', { name: `更換 ${T4_SWORD.name}` }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(screen.queryByText(/更換後：/)).toBeNull();

    const row = apply.closest('.bs-shop-item') as HTMLElement;
    fireEvent.click(row);
    expect(within(row).getByText(/更換後：/)).toBeTruthy();
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    await vi.waitFor(() => expect(useGameStore.getState().inventory[0].ability?.type).toBe('bonus_damage'));
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });
});
