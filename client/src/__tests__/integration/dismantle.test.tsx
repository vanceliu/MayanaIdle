// @vitest-environment jsdom
/**
 * 鐵匠鋪拆解（`06-equipment-acquire.md` § 6A.3「拆解」）——
 * 製作品與同模板掉落品都可拆、前置不退、裝備中與無配方不可拆、背包格數判定。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useGameStore, BAG_BASE_SLOTS } from '../../stores/gameStore';
import { resetTestDb } from '../../testing/testDb';
import { loadTemplateCache, resolveEquipment } from '../../systems/templateSync';
import { bagItemById } from '../../testing/bagFixtures';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { getBagItemAmount } from '../../models/bagItem';
import { getDismantleYield } from '../../systems/crafting';
import { TownBlacksmith } from '../../components/town/TownBlacksmith';

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

const T4 = EQUIPMENT_SEEDS.find(t => t.acquireType === 'craft' && t.tier === 4 && t.type !== 'armor')!;
const T5_WITH_PREREQ = EQUIPMENT_SEEDS.find(t => t.acquireType === 'craft' && t.tier === 5 && t.craftPrerequisiteWeapon)!;
const SHOP = EQUIPMENT_SEEDS.find(t => t.acquireType === 'shop')!;

const character = () => ({
  name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
  baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
  bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  gold: 0, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
  currentFloor: null, skills: [], quests: [], unspentAttributePoints: 0, areaEnteredAt: 0, createdAt: 0, userId: 1,
}) as never;

function instance(tpl: EquipmentTemplate, id: number, over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return resolveEquipment({
    id, templateId: tpl.id!, name: tpl.name, type: tpl.type, slot: tpl.slot, isTwoHanded: tpl.isTwoHanded,
    quality: 0, enhancement: 0, affixes: [], affixSlots: 4, ownerId: 1, equipped: false, ...over,
  } as EquipmentInstance);
}

const fillers = (count: number, startId: number) =>
  Array.from({ length: count }, (_, i) => instance(SHOP, startId + i));

function setup(inventory: EquipmentInstance[], over: Record<string, unknown> = {}) {
  useGameStore.setState({ character: character(), inventory, bagItems: [], equippedGear: {}, ...over });
}

beforeEach(async () => {
  resetTestDb();
  await loadTemplateCache();
});

describe('dismantleEquipment', () => {
  it.each([
    ['製作品', { isCraftedGear: true, enhancement: 5, quality: 10 }],
    ['同模板掉落品', {}],
  ])('%s：裝備消失、退一半材料（強化／品質不影響）', async (_label, over) => {
    setup([instance(T4, 7, over)]);
    const result = await useGameStore.getState().dismantleEquipment(7);
    expect(result.ok).toBe(true);
    const s = useGameStore.getState();
    expect(s.inventory).toHaveLength(0);
    for (const m of getDismantleYield(T4)!) expect(getBagItemAmount(s.bagItems, m.itemId)).toBe(m.amount);
  });

  it('退還量疊加到既有存量', async () => {
    const first = T4.craftMaterials![0];
    setup([instance(T4, 7)], { bagItems: [bagItemById(first.itemId, 10)] });
    await useGameStore.getState().dismantleEquipment(7);
    expect(getBagItemAmount(useGameStore.getState().bagItems, first.itemId)).toBe(10 + Math.ceil(first.amount / 2));
  });

  it('前置裝備不退還', async () => {
    setup([instance(T5_WITH_PREREQ, 7)]);
    await useGameStore.getState().dismantleEquipment(7);
    const s = useGameStore.getState();
    expect(s.inventory).toHaveLength(0);
    expect(s.bagItems).toHaveLength(T5_WITH_PREREQ.craftMaterials!.length);
  });

  it('身上的裝備不可拆', async () => {
    const worn = instance(T4, 7);
    setup([], { equippedGear: { [T4.slot]: worn } });
    const result = await useGameStore.getState().dismantleEquipment(7);
    expect(result.ok).toBe(false);
    expect(useGameStore.getState().equippedGear[T4.slot]?.id).toBe(7);
    expect(useGameStore.getState().bagItems).toHaveLength(0);
  });

  it('無配方的裝備不可拆', async () => {
    setup([instance(SHOP, 7)]);
    const result = await useGameStore.getState().dismantleEquipment(7);
    expect(result).toMatchObject({ ok: false, message: '這件裝備沒有配方，無法拆解' });
    expect(useGameStore.getState().inventory).toHaveLength(1);
  });

  it('不存在的實例回失敗', async () => {
    setup([instance(T4, 7)]);
    expect((await useGameStore.getState().dismantleEquipment(999)).ok).toBe(false);
    expect(useGameStore.getState().inventory).toHaveLength(1);
  });

  it('背包滿且退還材料需要新格子時拒絕', async () => {
    setup([instance(T4, 7), ...fillers(BAG_BASE_SLOTS - 1, 100)]);
    const result = await useGameStore.getState().dismantleEquipment(7);
    expect(result).toMatchObject({ ok: false, message: '背包已滿' });
    expect(useGameStore.getState().inventory).toHaveLength(BAG_BASE_SLOTS);
  });

  it('背包滿但材料都已有堆疊時可拆（空出裝備那一格）', async () => {
    const owned = T4.craftMaterials!.map(m => bagItemById(m.itemId, 1));
    setup([instance(T4, 7), ...fillers(BAG_BASE_SLOTS - 1 - owned.length, 100)], { bagItems: owned });
    expect((await useGameStore.getState().dismantleEquipment(7)).ok).toBe(true);
  });
});

describe('鐵匠鋪拆解分頁', () => {
  it('只列出有配方的未裝備實例，確認後拆解', () => {
    setup([instance(T4, 7), instance(SHOP, 8)], { craftQuests: [] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByRole('button', { name: '裝備拆解' }));
    expect(screen.getByText(T4.name)).toBeTruthy();
    expect(screen.queryByText(SHOP.name)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: `拆解 ${T4.name}` }));
    expect(confirm).toHaveBeenCalled();
    expect(useGameStore.getState().inventory.map(i => i.id)).toEqual([8]);
    confirm.mockRestore();
  });

  it('取消確認不拆', () => {
    setup([instance(T4, 7)], { craftQuests: [] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TownBlacksmith />);
    fireEvent.click(screen.getByRole('button', { name: '裝備拆解' }));
    fireEvent.click(screen.getByRole('button', { name: `拆解 ${T4.name}` }));
    expect(useGameStore.getState().inventory).toHaveLength(1);
    confirm.mockRestore();
  });
});
