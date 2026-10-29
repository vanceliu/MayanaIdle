// @vitest-environment jsdom
/**
 * (鍛) 製作品（`06-equipment-acquire.md` § 6A.6、`46-sigil.md` § 46.9）——
 * 製作寫入標記、顯示名稱加後綴、八種印記一律不受理；同模板的掉落品不受影響。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useGameStore } from '../../stores/gameStore';
import { resetTestDb } from '../../testing/testDb';
import { loadTemplateCache, resolveEquipment } from '../../systems/templateSync';
import { bagItemById } from '../../testing/bagFixtures';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { CRAFTED_GEAR_SUFFIX, type EquipmentInstance } from '../../models/equipment';
import { CRAFT_AFFIX_TIER_RANGE, isTierlessAffixType, type Affix } from '../../models/affix';
import { SIGIL_DEFINITIONS, CRAFTED_GEAR_SIGIL_REASON, type SigilType } from '../../models/sigil';
import { makeBagItem, getBagItemAmount } from '../../models/bagItem';
import { SigilMaster } from '../../components/town/SigilMaster';

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

const RECIPE = EQUIPMENT_SEEDS.find(t => t.acquireType === 'craft' && t.tier === 4 && !t.craftPrerequisiteWeapon && t.type !== 'armor')!;

const AFFIXES: Affix[] = [
  { type: 'attack_power', tier: 4, value: 12 },
  { type: 'crit_rate', tier: 3, value: 10 },
];

const character = (id?: number) => ({
  name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
  baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
  bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  gold: 1_000_000, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
  currentFloor: null, skills: [], quests: [], unspentAttributePoints: 0, areaEnteredAt: 0, createdAt: 0, userId: 1,
  ...(id != null ? { id } : {}),
}) as never;

function instance(over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return resolveEquipment({
    id: 7, templateId: RECIPE.id!, name: RECIPE.name, type: RECIPE.type, slot: RECIPE.slot,
    isTwoHanded: RECIPE.isTwoHanded, quality: 0, enhancement: 0, affixes: AFFIXES, affixSlots: 4,
    ownerId: 1, equipped: false, ...over,
  } as EquipmentInstance);
}

function setupSigils(item: EquipmentInstance) {
  useGameStore.setState({
    character: character(1),
    bagItems: SIGIL_DEFINITIONS.map(d => makeBagItem(d.itemId, 1)!),
    inventory: [item],
    equippedGear: {},
  });
}

beforeEach(async () => {
  resetTestDb();
  await loadTemplateCache();
});

describe('製作寫入 (鍛) 標記', () => {
  it('製作出來的實例帶標記、名稱加後綴、詞綴落在該階範圍', async () => {
    useGameStore.setState({
      character: character(),
      equippedGear: {},
      inventory: [],
      bagItems: RECIPE.craftMaterials!.map(m => bagItemById(m.itemId, 99)),
      craftQuests: [],
    });
    const result = await useGameStore.getState().craftEquipment(RECIPE.id!);
    expect(result.ok).toBe(true);
    const made = useGameStore.getState().inventory[0];
    expect(made.isCraftedGear).toBe(true);
    expect(made.name).toBe(`${RECIPE.name}${CRAFTED_GEAR_SUFFIX}`);
    expect(result.message).toContain(made.name);
    const { min, max } = CRAFT_AFFIX_TIER_RANGE[4];
    expect(made.affixes).toHaveLength(4);
    for (const a of made.affixes.filter(x => !isTierlessAffixType(x.type))) {
      expect(a.tier).toBeGreaterThanOrEqual(min);
      expect(a.tier).toBeLessThanOrEqual(max);
    }
  });

  it('重複 resolve 不會疊後綴；同模板的掉落品沒有後綴', () => {
    const crafted = instance({ isCraftedGear: true });
    expect(resolveEquipment(crafted).name).toBe(`${RECIPE.name}${CRAFTED_GEAR_SUFFIX}`);
    expect(instance().name).toBe(RECIPE.name);
  });
});

describe('(鍛) 製作品不可使用印記', () => {
  const types = SIGIL_DEFINITIONS.map(d => d.type);

  it('八種印記都列入檢查', () => {
    expect(new Set(types).size).toBe(8);
  });

  for (const type of types) {
    it(`${type}：不受理、不扣印記與金幣、詞綴不變`, () => {
      setupSigils(instance({ isCraftedGear: true }));
      const before = useGameStore.getState();
      const res = before.applySigil(7, type as SigilType, type === 'chaos' || type === 'add' || type === 'polish' ? null : 0) as { ok: boolean; message: string };
      expect(res.ok).toBe(false);
      expect(res.message).toBe(CRAFTED_GEAR_SIGIL_REASON);
      const after = useGameStore.getState();
      const itemId = SIGIL_DEFINITIONS.find(d => d.type === type)!.itemId;
      expect(getBagItemAmount(after.bagItems, itemId)).toBe(1);
      expect(after.character!.gold).toBe(before.character!.gold);
      expect(after.inventory[0].affixes).toEqual(AFFIXES);
    });
  }

  it('同模板的掉落品照常可用印記', () => {
    setupSigils(instance());
    const res = useGameStore.getState().applySigil(7, 'add', null) as { ok: boolean };
    expect(res.ok).toBe(true);
  });

  it('印記師清單標「製作品」', () => {
    setupSigils(instance({ isCraftedGear: true }));
    render(<SigilMaster />);
    expect(screen.getAllByText('製作品').length).toBeGreaterThan(0);
    expect(screen.getAllByText(`${RECIPE.name}${CRAFTED_GEAR_SUFFIX}`).length).toBeGreaterThan(0);
  });
});
