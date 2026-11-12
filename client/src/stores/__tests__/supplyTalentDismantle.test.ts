import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb } from '../../testing/testDb';
import { useGameStore, talentInitReady } from '../gameStore';
import { useTalentStore } from '../talentStore';
import { makeBagItem, getBagItemAmount } from '../../models/bagItem';
import { getDismantleYield } from '../../systems/crafting';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { EquipmentInstance } from '../../models/equipment';
import type { TalentSlot, TalentSlotEntry } from '../../models/talent';

/** 補給天賦「拆解裝備」「丟棄裝備」「存入指定道具」的執行（`49-village-script.md` § 49.3、§ 49.4.1、§ 49.4.2） */

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const T4_CRAFT = EQUIPMENT_SEEDS.find(t => t.acquireType === 'craft' && t.tier === 4 && t.slot === 'rightHand')!;
const T5_CRAFT = EQUIPMENT_SEEDS.find(t => t.acquireType === 'craft' && t.tier === 5 && t.slot === 'rightHand')!;
const T7_DROP = EQUIPMENT_SEEDS.find(t => t.acquireType === 'drop_only' && t.tier === 7 && t.slot === 'rightHand')!;
const RED_POTION = 1;

function slot(action: TalentSlotEntry): TalentSlot {
  return {
    id: 1, characterId: 1, tier: 1, assignedType: 'supply', templateId: 'default',
    order: 0, enabled: true, conditions: [null], action,
  };
}

function gear(id: number, templateId: number, over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  const t = EQUIPMENT_SEEDS.find(s => s.id === templateId)!;
  return {
    id, templateId, name: t.name, type: t.type, slot: t.slot, isTwoHanded: t.isTwoHanded,
    enhancement: 0, affixes: [], ownerId: 1, ...over,
  } as EquipmentInstance;
}

describe('補給天賦：拆解裝備、存入指定道具', () => {
  beforeEach(async () => {
    resetTestDb();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('Smith', 'knight', { STR: 2, AGI: 0, VIT: 2, SPI: 0, INT: 0, CHA: 0 });
    await talentInitReady();
    useGameStore.setState({ bagItems: [], abilityCrystals: [], lastVillageTickAt: 0 });
  });

  it('拆解：Tier 以下的拆成材料，掉落品開啟後存成結晶，Tier 以上不拆，寫日誌', () => {
    const craft = gear(9001, T4_CRAFT.id!);
    const drop = gear(9002, T7_DROP.id!, { ability: { type: 'bonus_damage', params: { chance: 10, damage: 5 } } });
    const aboveTier = gear(9003, T5_CRAFT.id!);
    useGameStore.setState({ inventory: [craft, drop, aboveTier] });
    useTalentStore.setState({
      characterId: 1,
      slots: [slot({
        ruleId: 'dismantle_equipment',
        params: { maxTier: 4, includeDropOnly: true, crystalMode: 'improve', keepClassUsable: false },
      })],
    });

    useGameStore.getState().runVillageScriptTick();

    const state = useGameStore.getState();
    expect(state.inventory.map(i => i.id)).toEqual([drop.id, aboveTier.id]);
    for (const m of getDismantleYield(T4_CRAFT)!) expect(getBagItemAmount(state.bagItems, m.itemId)).toBe(m.amount);
    expect(state.combatLogs.some(l => l.text.startsWith('村莊腳本：拆解裝備 1 件'))).toBe(true);
  });

  it('拆解：門檻含 T7 時帶技能的掉落品存成結晶', () => {
    const drop = gear(9002, T7_DROP.id!, { ability: { type: 'bonus_damage', params: { chance: 10, damage: 5 } } });
    useGameStore.setState({ inventory: [drop] });
    useTalentStore.setState({
      characterId: 1,
      slots: [slot({ ruleId: 'dismantle_equipment', params: { maxTier: 7, includeDropOnly: true, keepClassUsable: false } })],
    });

    useGameStore.getState().runVillageScriptTick();

    const state = useGameStore.getState();
    expect(state.inventory).toEqual([]);
    expect(state.abilityCrystals.map(c => c.type)).toEqual(['bonus_damage']);
  });

  it('拆解：保留條件開啟時，本角色穿得起的不拆', () => {
    useGameStore.setState({ inventory: [gear(9001, T4_CRAFT.id!)] });
    useTalentStore.setState({
      characterId: 1,
      slots: [slot({ ruleId: 'dismantle_equipment', params: { maxTier: 4 } })],
    });

    useGameStore.getState().runVillageScriptTick();

    expect(useGameStore.getState().inventory.map(i => i.id)).toEqual([9001]);
  });

  it('丟棄：刪掉符合的裝備並寫日誌', () => {
    const drop = gear(9002, T7_DROP.id!);
    const craft = gear(9001, T4_CRAFT.id!);
    useGameStore.setState({ inventory: [drop, craft] });
    useTalentStore.setState({
      characterId: 1,
      slots: [slot({ ruleId: 'discard_equipment', params: { maxTier: 7, discardScope: 'unsellable', keepClassUsable: false } })],
    });

    useGameStore.getState().runVillageScriptTick();

    const state = useGameStore.getState();
    expect(state.inventory.map(i => i.id)).toEqual([craft.id]);
    expect(state.combatLogs.some(l => l.text === '村莊腳本：丟棄裝備 1 件')).toBe(true);
  });

  it('存入指定道具：身上留下設定數量，其餘進帳號倉庫', () => {
    useGameStore.setState({ bagItems: [makeBagItem(RED_POTION, 30)!] });
    useTalentStore.setState({
      characterId: 1,
      slots: [slot({ ruleId: 'deposit_items', params: { warehouse: 'shared', itemId: RED_POTION, keepAmount: 20 } })],
    });

    useGameStore.getState().runVillageScriptTick();

    const state = useGameStore.getState();
    expect(getBagItemAmount(state.bagItems, RED_POTION)).toBe(20);
    expect(getBagItemAmount(state.storedMaterials, RED_POTION)).toBe(10);
    expect(state.combatLogs.some(l => l.text === '村莊腳本：存入道具 1 種')).toBe(true);
  });
});
