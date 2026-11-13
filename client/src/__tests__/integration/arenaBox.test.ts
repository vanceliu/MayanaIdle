/**
 * 競技場票券與兌換箱（`55-arena.md` § 55.8／§ 55.9）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore, getBagUsedSlots } from '../../stores/gameStore';
import { resetTestDb } from '../../testing/testDb';
import { loadTemplateCache, resolveEquipment, getCachedTemplates } from '../../systems/templateSync';
import { bagItemById } from '../../testing/bagFixtures';
import { getBagItemAmount } from '../../models/bagItem';
import { getItemById } from '../../models/items';
import { MIMIC_GEAR_SUFFIX, type EquipmentInstance } from '../../models/equipment';
import { AFFIX_SOCKETS } from '../../models/affix';
import { canUseSigil, MIMIC_GEAR_SIGIL_REASON } from '../../models/sigil';
import { getDismantleOutcome } from '../../systems/crafting';
import { validateOffer } from '../../systems/trade';
import { getTemplateSellPrice } from '../../systems/shop';
import {
  ARENA_BOXES, ARENA_TICKET_ITEM_IDS, arenaBoxCandidates, arenaBoxKindOf, getArenaBox, rollArenaBoxEquipment,
} from '../../systems/arenaBox';

const character = (over: Record<string, unknown> = {}) => ({
  name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
  baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
  bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  gold: 0, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
  currentFloor: null, skills: [], quests: [], unspentAttributePoints: 0, areaEnteredAt: 0, createdAt: 0, userId: 1, id: 1,
  ...over,
}) as never;

const T6_WEAPON_BOX = ARENA_BOXES.find(b => b.tier === 6 && b.kind === 'weapon')!;
const T5_ACCESSORY_BOX = ARENA_BOXES.find(b => b.tier === 5 && b.kind === 'accessory')!;

beforeEach(async () => {
  resetTestDb();
  await loadTemplateCache();
  vi.restoreAllMocks();
});

describe('道具定義', () => {
  it('票券：重量 0、綁角色、不可販售；不佔背包格', () => {
    for (const id of Object.values(ARENA_TICKET_ITEM_IDS)) {
      expect(getItemById(id!)).toMatchObject({ weight: 0, bound: true, noSell: true });
    }
    expect(getBagUsedSlots([bagItemById(ARENA_TICKET_ITEM_IDS[4]!, 30)], [], {})).toBe(0);
  });

  it('兌換箱：T4～T6 × 武器／防具／飾品，重量 1、綁角色；價格 10／6／6', () => {
    expect(ARENA_BOXES).toHaveLength(9);
    for (const b of ARENA_BOXES) expect(getItemById(b.itemId)).toMatchObject({ weight: 1, bound: true, noSell: true });
    expect(ARENA_BOXES.map(b => b.price)).toEqual([10, 6, 6, 10, 6, 6, 10, 6, 6]);
  });

  it('綁角色的道具不可交易', () => {
    useGameStore.setState({ character: character(), bagItems: [bagItemById(ARENA_TICKET_ITEM_IDS[4]!, 5)], inventory: [], equippedGear: {} });
    const r = validateOffer(useGameStore.getState(), { equipmentIds: [], items: [{ itemId: ARENA_TICKET_ITEM_IDS[4]!, amount: 1 }], gold: 0 });
    expect(r.ok).toBe(false);
  });

  it('綁角色的道具不可存倉庫', () => {
    const ticket = ARENA_TICKET_ITEM_IDS[4]!;
    useGameStore.setState({ character: character(), bagItems: [bagItemById(ticket, 5)], inventory: [], equippedGear: {}, personalStoredMaterials: [], personalStoredEquipment: [] });
    useGameStore.getState().depositToWarehouse({ warehouse: 'personal', materials: [{ itemId: ticket, amount: 5 }] });
    expect(getBagItemAmount(useGameStore.getState().bagItems, ticket)).toBe(5);
    expect(useGameStore.getState().personalStoredMaterials).toEqual([]);
  });
});

describe('兌換', () => {
  it('在城鎮以票券兌換兌換箱', () => {
    useGameStore.setState({ character: character(), bagItems: [bagItemById(T6_WEAPON_BOX.ticketItemId, 12)], inventory: [], equippedGear: {} });
    expect(useGameStore.getState().exchangeArenaBox(T6_WEAPON_BOX.itemId).ok).toBe(true);
    const bag = useGameStore.getState().bagItems;
    expect(getBagItemAmount(bag, T6_WEAPON_BOX.ticketItemId)).toBe(2);
    expect(getBagItemAmount(bag, T6_WEAPON_BOX.itemId)).toBe(1);
  });

  it('票券不足或不在城鎮時拒絕', () => {
    useGameStore.setState({ character: character(), bagItems: [bagItemById(T6_WEAPON_BOX.ticketItemId, 9)], inventory: [], equippedGear: {} });
    expect(useGameStore.getState().exchangeArenaBox(T6_WEAPON_BOX.itemId)).toEqual({ ok: false, message: '票券不足' });
    useGameStore.setState({ character: character({ currentRegion: 'dawn-plains' }), bagItems: [bagItemById(T6_WEAPON_BOX.ticketItemId, 10)] });
    expect(useGameStore.getState().exchangeArenaBox(T6_WEAPON_BOX.itemId).ok).toBe(false);
  });
});

describe('開箱', () => {
  it('從該階該類的模板抽一件放進背包，扣掉箱子', async () => {
    useGameStore.setState({ character: character(), bagItems: [bagItemById(T6_WEAPON_BOX.itemId, 1)], inventory: [], equippedGear: {} });
    const r = await useGameStore.getState().openArenaBox(T6_WEAPON_BOX.itemId);
    expect(r.ok).toBe(true);
    const [item] = useGameStore.getState().inventory;
    const template = getCachedTemplates().find(t => t.id === item.templateId)!;
    expect(template.tier).toBe(6);
    expect(arenaBoxKindOf(template)).toBe('weapon');
    expect(getBagItemAmount(useGameStore.getState().bagItems, T6_WEAPON_BOX.itemId)).toBe(0);
  });

  it('擬態品：4 條一般詞綴＋封印詞綴，武器必帶最低端隨機技能，名稱加 (擬)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const template = arenaBoxCandidates(T6_WEAPON_BOX, getCachedTemplates())[0];
    const record = rollArenaBoxEquipment(T6_WEAPON_BOX, template, 1, 'knight');
    expect(record.isMimicGear).toBe(true);
    expect(record.affixes!.filter(a => !a.sealed)).toHaveLength(AFFIX_SOCKETS);
    expect(record.affixes!.filter(a => a.sealed)).toHaveLength(1);
    expect(record.ability).toBeDefined();
    const item = resolveEquipment({ ...record, name: template.name, type: template.type, isTwoHanded: template.isTwoHanded } as EquipmentInstance);
    expect(item.name).toBe(`${template.name}${MIMIC_GEAR_SUFFIX}`);
  });

  it('擬態飾品也必帶隨機技能', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const template = arenaBoxCandidates(T5_ACCESSORY_BOX, getCachedTemplates()).find(t => t.slot === 'necklace' || t.slot === 'ring1')!;
    const record = rollArenaBoxEquipment(T5_ACCESSORY_BOX, template, 1, 'knight');
    expect(record.isMimicGear).toBe(true);
    expect(record.ability).toBeDefined();
  });

  it('非擬態品：不帶標記；擲到 10% 以外不帶封印詞綴', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const template = arenaBoxCandidates(T5_ACCESSORY_BOX, getCachedTemplates())[0];
    const record = rollArenaBoxEquipment(T5_ACCESSORY_BOX, template, 1, 'knight');
    expect(record.isMimicGear).toBeUndefined();
    expect(record.affixes!.some(a => a.sealed)).toBe(false);
  });

  it('擬態品不受理印記、不可拆；可照模板售價賣出', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const template = arenaBoxCandidates(T6_WEAPON_BOX, getCachedTemplates())[0];
    const record = rollArenaBoxEquipment(T6_WEAPON_BOX, template, 1, 'knight');
    const item = resolveEquipment({ ...record, id: 9, name: template.name, type: template.type, isTwoHanded: template.isTwoHanded } as EquipmentInstance);
    expect(canUseSigil('chaos', item.affixes, undefined, { category: 'weapon', isMimicGear: true, quality: 0 })).toEqual({ ok: false, reason: MIMIC_GEAR_SIGIL_REASON });
    expect(getDismantleOutcome(item, template)).toEqual({ yields: null });
    expect(getTemplateSellPrice(template)).toBeGreaterThan(0);
  });

  it('每個兌換箱都有候選模板', () => {
    for (const b of ARENA_BOXES) expect(arenaBoxCandidates(getArenaBox(b.itemId)!, getCachedTemplates()).length, `T${b.tier} ${b.kind}`).toBeGreaterThan(0);
  });
});
