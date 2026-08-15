import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore, talentInitReady } from '../gameStore';
import { useTalentStore } from '../talentStore';
import { makeBagItem } from '../../models/bagItem';
import { TOWN_SCROLL_CONFIG } from '../../models/townScroll';
import type { TalentSlot, TalentSlotEntry } from '../../models/talent';

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

const NEUTRAL_TOWN = 'neutral-town';
const NEUTRAL_SCROLL = TOWN_SCROLL_CONFIG[NEUTRAL_TOWN].itemId;
const ZONE = 'newbie-neutral';
const HUNT_AREA = 'dawn-plains';
const OTHER_AREA = 'green-valley';

function supplySlot(action: TalentSlotEntry): TalentSlot {
  return {
    id: 1,
    characterId: 1,
    tier: 1,
    assignedType: 'supply',
    templateId: 'default',
    order: 0,
    enabled: true,
    conditions: [null],
    action,
  };
}

function setSupplyAction(action: TalentSlotEntry) {
  useTalentStore.setState({ characterId: 1, slots: [supplySlot(action)] });
  useGameStore.setState({ lastVillageTickAt: 0 });
}

function goHunt() {
  useGameStore.getState().navigateTo({ zoneId: ZONE, regionId: HUNT_AREA, floor: null });
}

/** 上次掛機點與待返回旗標（`49-village-script.md` § 49.5） */
describe('返回掛機點', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter(
      'Hunter', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 },
    );
    // 天賦初始化會蓋掉 slots，必須等它做完才塞測試用天賦格
    await talentInitReady();
    // 角色建立後在薄暮村，背包放回城卷軸供自動與手動回城使用
    useGameStore.setState({
      bagItems: [makeBagItem(NEUTRAL_SCROLL, 5)!],
      lastVillageTickAt: 0,
    });
  });

  it('進入非城鎮區域時記錄掛機點並清掉待返回旗標', () => {
    useGameStore.setState({ huntReturnPending: true });

    goHunt();

    const state = useGameStore.getState();
    expect(state.lastHuntLocation).toEqual({ zoneId: ZONE, regionId: HUNT_AREA, floor: null });
    expect(state.huntReturnPending).toBe(false);
  });

  it('城鎮不記錄成掛機點', () => {
    goHunt();

    useGameStore.getState().navigateTo({ zoneId: ZONE, regionId: NEUTRAL_TOWN, floor: null });

    expect(useGameStore.getState().lastHuntLocation).toEqual({ zoneId: ZONE, regionId: HUNT_AREA, floor: null });
  });

  it('手動回城不設旗標，不會被自動傳回掛機點', () => {
    goHunt();

    useGameStore.getState().useTownScroll(NEUTRAL_SCROLL);
    expect(useGameStore.getState().huntReturnPending).toBe(false);

    setSupplyAction({ ruleId: 'return_to_hunt', params: {} });
    useGameStore.getState().runVillageScriptTick();

    expect(useGameStore.getState().character!.currentRegion).toBe(NEUTRAL_TOWN);
  });

  it('補給天賦「回城」設起旗標，下一輪「返回上次掛機點」把角色送回去', () => {
    goHunt();

    setSupplyAction({ ruleId: 'return_town', params: {} });
    useGameStore.getState().runVillageScriptTick();

    expect(useGameStore.getState().character!.currentRegion).toBe(NEUTRAL_TOWN);
    expect(useGameStore.getState().huntReturnPending).toBe(true);

    setSupplyAction({ ruleId: 'return_to_hunt', params: {} });
    useGameStore.getState().runVillageScriptTick();

    const state = useGameStore.getState();
    expect(state.character!.currentRegion).toBe(HUNT_AREA);
    expect(state.character!.currentFloor).toBeNull();
    expect(state.huntReturnPending).toBe(false);
  });

  it('手動 navigateTo 換掛機點後位置更新、旗標清空', () => {
    goHunt();
    setSupplyAction({ ruleId: 'return_town', params: {} });
    useGameStore.getState().runVillageScriptTick();

    useGameStore.getState().navigateTo({ zoneId: ZONE, regionId: OTHER_AREA, floor: null });

    const state = useGameStore.getState();
    expect(state.lastHuntLocation).toEqual({ zoneId: ZONE, regionId: OTHER_AREA, floor: null });
    expect(state.huntReturnPending).toBe(false);
  });

  it('手動 changeArea 換掛機點後位置更新、旗標清空', () => {
    goHunt();
    setSupplyAction({ ruleId: 'return_town', params: {} });
    useGameStore.getState().runVillageScriptTick();

    useGameStore.getState().changeArea(OTHER_AREA);

    const state = useGameStore.getState();
    expect(state.lastHuntLocation).toEqual({ zoneId: ZONE, regionId: OTHER_AREA, floor: null });
    expect(state.huntReturnPending).toBe(false);
  });

  it('navigateTo 換掛機點後，落地的 prefs 是新區域且旗標為 false', async () => {
    goHunt();
    setSupplyAction({ ruleId: 'return_town', params: {} });
    useGameStore.getState().runVillageScriptTick();
    const characterId = useGameStore.getState().character!.id!;

    useGameStore.getState().navigateTo({ zoneId: ZONE, regionId: OTHER_AREA, floor: null });

    // saveGame 內部有多段 await，localStorage 是最後一步才寫
    await vi.waitFor(() => {
      const prefs = JSON.parse(localStorage.getItem(`mayana_prefs_${characterId}`) ?? 'null');
      expect(prefs?.lastHuntLocation).toEqual({ zoneId: ZONE, regionId: OTHER_AREA, floor: null });
      expect(prefs?.huntReturnPending).toBe(false);
    });
  });

  it('changeArea 換掛機點後，落地的 prefs 是新區域且旗標為 false', async () => {
    goHunt();
    setSupplyAction({ ruleId: 'return_town', params: {} });
    useGameStore.getState().runVillageScriptTick();
    const characterId = useGameStore.getState().character!.id!;

    useGameStore.getState().changeArea(OTHER_AREA);

    await vi.waitFor(() => {
      const prefs = JSON.parse(localStorage.getItem(`mayana_prefs_${characterId}`) ?? 'null');
      expect(prefs?.lastHuntLocation).toEqual({ zoneId: ZONE, regionId: OTHER_AREA, floor: null });
      expect(prefs?.huntReturnPending).toBe(false);
    });
  });
});
