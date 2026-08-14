import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore } from '../gameStore';
import { useTalentStore } from '../talentStore';
import { getItemDefinition } from '../../models/items';
import { makeBagItem } from '../../models/bagItem';
import type { TalentSlot } from '../../models/talent';

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

const MATERIALS = ['破碎獸牙', '黏液殘渣', '粗糙獸皮'];

function supplySlot(over: Partial<TalentSlot> = {}): TalentSlot {
  return {
    id: 1,
    characterId: 1,
    tier: 1,
    assignedType: 'supply',
    templateId: 'default',
    order: 0,
    enabled: true,
    conditions: [null],
    action: { ruleId: 'sell_materials', params: { maxTier: 2, skipCraftMaterials: true } },
    ...over,
  };
}

describe('補給天賦：販售素材（`49-village-script.md`、`51-auto-talent.md`）', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter(
      'Seller', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 },
    );
    // 角色建立後在城鎮，背包塞三種可賣素材
    useGameStore.setState({
      bagItems: MATERIALS.map(n => makeBagItem(getItemDefinition(n)!.id!, 5)!),
      lastVillageTickAt: 0,
    });
    useTalentStore.setState({ characterId: 1, slots: [supplySlot()] });
  });

  it('人在城鎮時會賣掉 Tier 以下的素材', () => {
    const goldBefore = useGameStore.getState().character!.gold;

    useGameStore.getState().runVillageScriptTick();

    const state = useGameStore.getState();
    expect(state.bagItems.filter(b => MATERIALS.includes(b.name))).toHaveLength(0);
    expect(state.character!.gold).toBeGreaterThan(goldBefore);
    expect(state.combatLogs.some(l => l.text.includes('販售素材'))).toBe(true);
  });

  it('天賦格停用時不賣', () => {
    useTalentStore.setState({ slots: [supplySlot({ enabled: false })] });
    useGameStore.setState({ lastVillageTickAt: 0 });

    useGameStore.getState().runVillageScriptTick();

    expect(useGameStore.getState().bagItems.filter(b => MATERIALS.includes(b.name))).toHaveLength(3);
  });

  it('天賦格掛在別份配置時不賣', () => {
    useTalentStore.setState({ slots: [supplySlot({ templateId: 'tpl-other' })] });
    useGameStore.setState({ lastVillageTickAt: 0 });

    useGameStore.getState().runVillageScriptTick();

    expect(useGameStore.getState().bagItems.filter(b => MATERIALS.includes(b.name))).toHaveLength(3);
  });

  /**
   * 補給天賦唯一的驅動來源是常駐迴圈（`runVillageScriptTick` 只有那一個呼叫端）。
   * 新角色沒起迴圈的話，補給／常駐／緊急撤退三樣全部靜默失效。
   */
  it('createCharacter 會啟動常駐迴圈', () => {
    expect(useGameStore.getState().persistentLoopId).not.toBeNull();
  });

  it('不在城鎮時不賣', () => {
    const char = useGameStore.getState().character!;
    useGameStore.setState({
      character: { ...char, currentRegion: 'dawn-plains', currentArea: 'dawn-plains' },
      lastVillageTickAt: 0,
    });

    useGameStore.getState().runVillageScriptTick();

    expect(useGameStore.getState().bagItems.filter(b => MATERIALS.includes(b.name))).toHaveLength(3);
  });
});
