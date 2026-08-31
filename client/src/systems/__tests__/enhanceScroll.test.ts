import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { loadTemplateCache } from '../../systems/templateSync';
import { useGameStore } from '../../stores/gameStore';
import { bagItemById } from '../../testing/bagFixtures';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import {
  WEAPON_ENHANCE_SCROLL_ID, ARMOR_ENHANCE_SCROLL_ID,
  WEAPON_ENHANCE_PLUS_SCROLL_ID, WEAPON_ENHANCE_MINUS_SCROLL_ID,
  applyEnhanceScroll, canScrollTarget, getEnhanceScroll, getEnhanceRate, isEnhanceable,
} from '../enhanceScroll';
import type { EquipmentInstance } from '../../models/equipment';

/**
 * 卷軸結算的共用出口（`06-equipment.md` § 6.9／§ 6.10／§ 6.12）。
 * 背包與鐵匠鋪走同一支，所以判定規則只在這裡驗一次。
 */

function instanceOf(name: string, patch: Partial<EquipmentInstance> = {}): EquipmentInstance {
  const tpl = EQUIPMENT_SEEDS.find(t => t.name === name)!;
  return {
    id: 101, templateId: tpl.id!, name: tpl.name, type: tpl.type, slot: tpl.slot,
    isTwoHanded: tpl.isTwoHanded, smallMonsterDamage: tpl.smallMonsterDamage,
    largeMonsterDamage: tpl.largeMonsterDamage, defense: tpl.defense,
    quality: 0, enhancement: 0, stability: tpl.stability, affixes: [],
    ownerId: 1, equipped: false, ...patch,
  } as never;
}

/** 鋼心劍：安定值 6 的武器 */
const sword = (patch?: Partial<EquipmentInstance>) => instanceOf('鋼心劍', patch);
/** 皮腰帶：安定值 -1，不可強化 */
const belt = (patch?: Partial<EquipmentInstance>) => instanceOf('皮腰帶', patch);

const weaponScroll = () => getEnhanceScroll(WEAPON_ENHANCE_SCROLL_ID)!;
const armorScroll = () => getEnhanceScroll(ARMOR_ENHANCE_SCROLL_ID)!;
const plusScroll = () => getEnhanceScroll(WEAPON_ENHANCE_PLUS_SCROLL_ID)!;
const minusScroll = () => getEnhanceScroll(WEAPON_ENHANCE_MINUS_SCROLL_ID)!;

function setup(item: EquipmentInstance, bag = [bagItemById(WEAPON_ENHANCE_SCROLL_ID, 3)]) {
  useGameStore.setState({
    character: { name: 'T', className: 'knight', level: 30, gold: 0, id: 1, userId: 1 } as never,
    equippedGear: {},
    inventory: [item],
    bagItems: bag,
  });
}

const inv = () => useGameStore.getState().inventory;
const bagAmount = (id: number) => useGameStore.getState().bagItems.find(b => b.itemId === id)?.amount ?? 0;

describe('強化卷軸的目標判定', () => {
  it('武器卷軸只吃武器，防具卷軸只吃防具', () => {
    expect(canScrollTarget(weaponScroll(), sword())).toBe(true);
    expect(canScrollTarget(armorScroll(), sword())).toBe(false);
  });

  it('腰帶不可強化（安定值 -1，§ 6.10）', () => {
    expect(isEnhanceable(belt())).toBe(false);
    expect(canScrollTarget(armorScroll(), belt())).toBe(false);
  });

  it('－ 卷軸在 +0 沒有目標', () => {
    expect(canScrollTarget(minusScroll(), sword({ enhancement: 0 }))).toBe(false);
    expect(canScrollTarget(minusScroll(), sword({ enhancement: 1 }))).toBe(true);
  });

  it('武器安定值內必成，超出後固定 1/3（§ 6.9）', () => {
    expect(getEnhanceRate(sword(), 6)).toBe(1);
    expect(getEnhanceRate(sword(), 7)).toBeCloseTo(1 / 3);
    expect(getEnhanceRate(sword(), 10)).toBeCloseTo(1 / 3);
  });
});

describe('強化卷軸的結算', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resetSeedState();
    await seedDatabase();
    await loadTemplateCache();
  });

  it('安定值內成功，消耗一張卷軸', () => {
    setup(sword({ enhancement: 2 }));
    const outcome = applyEnhanceScroll(weaponScroll(), { item: inv()[0] }, () => 0.99);

    expect(outcome?.success).toBe(true);
    expect(outcome?.fx).toBe('safe');
    expect(inv()[0].enhancement).toBe(3);
    expect(bagAmount(WEAPON_ENHANCE_SCROLL_ID)).toBe(2);
  });

  it('超出安定值成功時走 success 演出', () => {
    setup(sword({ enhancement: 6 }));
    const outcome = applyEnhanceScroll(weaponScroll(), { item: inv()[0] }, () => 0.1);

    expect(outcome?.fx).toBe('success');
    expect(inv()[0].enhancement).toBe(7);
  });

  it('超出安定值失敗時裝備消失並計入損毀數', () => {
    setup(sword({ enhancement: 6 }));
    const before = useGameStore.getState().statistics.weaponsBroken;
    const outcome = applyEnhanceScroll(weaponScroll(), { item: inv()[0] }, () => 0.99);

    expect(outcome?.success).toBe(false);
    expect(outcome?.ghost?.name).toBe('鋼心劍');
    expect(inv()).toHaveLength(0);
    expect(useGameStore.getState().statistics.weaponsBroken).toBe(before + 1);
  });

  it('卷軸不足時不結算、不消耗', () => {
    setup(sword({ enhancement: 0 }), [bagItemById(WEAPON_ENHANCE_SCROLL_ID, 0)]);
    expect(applyEnhanceScroll(weaponScroll(), { item: inv()[0] })).toBeNull();
    expect(inv()[0].enhancement).toBe(0);
  });

  it('目標不合法時不結算、不消耗卷軸', () => {
    setup(sword({ enhancement: 0 }), [bagItemById(ARMOR_ENHANCE_SCROLL_ID, 3)]);
    expect(applyEnhanceScroll(armorScroll(), { item: inv()[0] })).toBeNull();
    expect(bagAmount(ARMOR_ENHANCE_SCROLL_ID)).toBe(3);
  });

  it('＋卷軸的成功率看使用前等級，抽到幾級只決定跳多遠（§ 6.12）', () => {
    setup(sword({ enhancement: 5 }), [bagItemById(WEAPON_ENHANCE_PLUS_SCROLL_ID, 1)]);
    // 第一顆決定級數（0.9 → +3），第二顆是判定；判的是 +6 那一格，安定值內必成
    const rolls = [0.9, 0.999];
    const outcome = applyEnhanceScroll(plusScroll(), { item: inv()[0] }, () => rolls.shift()!);

    expect(outcome?.success).toBe(true);
    expect(inv()[0].enhancement).toBe(8);
  });

  it('＋卷軸抽到 1 時只 +1，且只消耗上位卷軸', () => {
    setup(sword({ enhancement: 0 }), [
      bagItemById(WEAPON_ENHANCE_SCROLL_ID, 2),
      bagItemById(WEAPON_ENHANCE_PLUS_SCROLL_ID, 2),
    ]);
    const rolls = [0, 0];
    applyEnhanceScroll(plusScroll(), { item: inv()[0] }, () => rolls.shift()!);

    expect(inv()[0].enhancement).toBe(1);
    expect(bagAmount(WEAPON_ENHANCE_PLUS_SCROLL_ID)).toBe(1);
    expect(bagAmount(WEAPON_ENHANCE_SCROLL_ID)).toBe(2);
  });

  it('－卷軸必定成功且不計入強化次數（§ 6.12）', () => {
    setup(sword({ enhancement: 4 }), [bagItemById(WEAPON_ENHANCE_MINUS_SCROLL_ID, 1)]);
    const before = useGameStore.getState().statistics.weaponEnhanceAttempts;
    const outcome = applyEnhanceScroll(minusScroll(), { item: inv()[0] }, () => 0.99);

    expect(outcome?.success).toBe(true);
    expect(inv()[0].enhancement).toBe(3);
    expect(useGameStore.getState().statistics.weaponEnhanceAttempts).toBe(before);
  });

  it('身上裝備的結果寫回 equippedGear', () => {
    const item = sword({ enhancement: 1 });
    setup(item);
    useGameStore.setState({ inventory: [], equippedGear: { rightHand: item } as never });

    applyEnhanceScroll(weaponScroll(), { item, slot: 'rightHand' }, () => 0.99);

    expect(useGameStore.getState().equippedGear.rightHand?.enhancement).toBe(2);
  });
});
