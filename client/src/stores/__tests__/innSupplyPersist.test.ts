import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp, INN_PRICES, talentInitReady } from '../gameStore';
import { useTalentStore } from '../talentStore';
import type { TalentSlot } from '../../models/talent';
import type { ActiveEffect } from '../../models/effect';

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

function innSlot(): TalentSlot {
  return {
    id: 1,
    characterId: 1,
    tier: 1,
    assignedType: 'supply',
    templateId: 'default',
    order: 0,
    enabled: true,
    conditions: [null],
    action: { ruleId: 'use_inn', params: {} },
  };
}

function playerEffect(over: Partial<ActiveEffect>): ActiveEffect {
  return {
    id: 'e1',
    sourceSkillId: 'test',
    sourceSkillName: 'test',
    category: 'test',
    type: 'debuff',
    target: 'player',
    startTime: Date.now(),
    duration: 600_000,
    tags: [],
    name: 'test',
    description: 'test',
    ...over,
  };
}

/**
 * 補給天賦「使用旅館」（`49-village-script.md` § 49.3、`13-town.md` § 13.7）：
 * 恢復 HP／MP、扣 `INN_PRICES.full`、解除玩家異常狀態，且變更要落地。
 */
describe('補給天賦：使用旅館', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter(
      'Innkeeper', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 },
    );
    // 迴圈會自行再跑一輪 tick 並回血，數值斷言要求場面固定
    useGameStore.getState().stopPersistentLoop();
    useGameStore.getState().stopRegen();

    const char = useGameStore.getState().character!;
    // 天賦初始化會蓋掉 slots，必須等它做完才塞測試用天賦格
    await talentInitReady();

    useGameStore.setState({
      character: { ...char, hp: 1, mp: 1, gold: INN_PRICES.full * 4 },
      activeEffects: [
        playerEffect({ id: 'poison', type: 'debuff', target: 'player' }),
        playerEffect({ id: 'blessing', type: 'buff', target: 'player' }),
      ],
    });

    // DB 先落地成殘血版：建角寫進去的是全滿，不覆蓋掉的話「有沒有存」看不出差別
    useGameStore.getState().saveState();
    await vi.waitFor(async () => {
      expect((await db.characters.get(char.id!))!.hp).toBe(1);
    });

    useTalentStore.setState({ characterId: char.id!, slots: [innSlot()] });
    useGameStore.setState({ lastVillageTickAt: 0 });
  });

  it('在城鎮且錢足夠時補滿 HP／MP、扣款、解除異常狀態', () => {
    const before = useGameStore.getState().character!;
    const goldBefore = before.gold;
    const effMaxHp = getEffectiveMaxHp(before, useGameStore.getState().equippedGear);
    const effMaxMp = getEffectiveMaxMp(before, useGameStore.getState().equippedGear);

    useGameStore.getState().runVillageScriptTick();

    const state = useGameStore.getState();
    expect(state.character!.hp).toBe(effMaxHp);
    expect(state.character!.mp).toBe(effMaxMp);
    expect(state.character!.gold).toBe(goldBefore - INN_PRICES.full);
    // 異常狀態解除，增益不受影響（活躍效果不入 DB，只驗記憶體）
    expect(state.activeEffects.map(e => e.id)).toEqual(['blessing']);
  });

  it('HP／MP 與金幣寫進 characters 表，不是只改記憶體', async () => {
    const before = useGameStore.getState().character!;
    const characterId = before.id!;
    const goldAfter = before.gold - INN_PRICES.full;
    const effMaxHp = getEffectiveMaxHp(before, useGameStore.getState().equippedGear);
    const effMaxMp = getEffectiveMaxMp(before, useGameStore.getState().equippedGear);

    useGameStore.getState().runVillageScriptTick();

    await vi.waitFor(async () => {
      const row = await db.characters.get(characterId);
      expect(row!.hp).toBe(effMaxHp);
      expect(row!.mp).toBe(effMaxMp);
      expect(row!.gold).toBe(goldAfter);
    });
  });

  it('重新載入角色後拿到的是補滿後的數值', async () => {
    const before = useGameStore.getState().character!;
    const characterId = before.id!;
    const goldAfter = before.gold - INN_PRICES.full;
    const effMaxHp = getEffectiveMaxHp(before, useGameStore.getState().equippedGear);

    useGameStore.getState().runVillageScriptTick();

    await vi.waitFor(async () => {
      expect((await db.characters.get(characterId))!.gold).toBe(goldAfter);
    });

    useGameStore.setState({ character: null, phase: 'title' });
    expect(await useGameStore.getState().loadCharacter()).toBe(true);

    const loaded = useGameStore.getState().character!;
    expect(loaded.hp).toBe(effMaxHp);
    expect(loaded.gold).toBe(goldAfter);
  });

  it('金幣不足時不進旅館，也不會有寫入', async () => {
    const char = useGameStore.getState().character!;
    useGameStore.setState({
      character: { ...char, gold: INN_PRICES.full - 1 },
      lastVillageTickAt: 0,
    });

    useGameStore.getState().runVillageScriptTick();

    const state = useGameStore.getState();
    expect(state.character!.hp).toBe(1);
    expect(state.character!.gold).toBe(INN_PRICES.full - 1);
    expect(state.activeEffects.map(e => e.id)).toEqual(['poison', 'blessing']);
  });
});
