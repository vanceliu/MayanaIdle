import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore, processMonsterDeath, waitForPendingDrops } from '../gameStore';
import type { AdventurerQuest } from '../../models/adventurerQuest';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

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

/** 兩張同 BOSS 的素材收集任務（§ 36.2.5），重現玩家實際接到的狀況 */
function bossCollectQuest(id: string, title: string): AdventurerQuest {
  return {
    id,
    type: 'collectboss',
    difficulty: 'B',
    status: 'active',
    title,
    description: '收集試煉飛龍的素材 3 個',
    targetArea: 'trial-highlands-top',
    targetMonster: '試煉飛龍',
    targetCount: 3,
    currentCount: 0,
    reward: { type: 'gold', amount: 45000 },
    contributionPoints: 350,
  };
}

describe('collectboss 任務 — 同一隻 BOSS 的兩張任務同時進度', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    useGameStore.setState({
      phase: 'title',
      userId: null,
      characterList: [],
      character: null,
      equippedGear: {},
      inventory: [],
      bagItems: [],
      skills: [],
      combatLogs: [],
      activeEffects: [],
      adventurerQuests: [],
    });
    await useGameStore.getState().initUser();
  });

  afterEach(async () => {
    await waitForPendingDrops();
    vi.restoreAllMocks();
  });

  async function killTrialDragon() {
    await useGameStore.getState().createCharacter('BossCollect', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const char = {
      ...useGameStore.getState().character!,
      currentArea: 'trial-highlands-top',
      currentRegion: 'trial-highlands-top',
      currentFloor: null,
    };
    const deadBoss = {
      templateId: 20, name: '試煉飛龍', level: 30, currentHp: 0, maxHp: 1200,
      attackMin: 25, attackMax: 36, defense: 16, exp: 2500,
      race: 'dragon' as const, size: 'large' as const, element: 'wind' as const,
      isBoss: true, attackType: 'melee' as const, attackRange: 1.5, attackInterval: 1000, _processed: false,
    };

    useGameStore.setState({
      phase: 'combat',
      character: char,
      activeEffects: [],
      adventurerQuests: [
        bossCollectQuest('boss-collect-a', 'BOSS 素材徵集'),
        bossCollectQuest('boss-collect-b', '珍稀材料獵取'),
      ],
    });

    processMonsterDeath(() => useGameStore.getState(), s => useGameStore.setState(s), [deadBoss], 0, char as any, [], []);
    await waitForPendingDrops();
    return useGameStore.getState().adventurerQuests;
  }

  it('擲中時兩張任務各 +1（共用同一次 30% 判定）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const quests = await killTrialDragon();
    expect(quests.find(q => q.id === 'boss-collect-a')?.currentCount).toBe(1);
    expect(quests.find(q => q.id === 'boss-collect-b')?.currentCount).toBe(1);
  });

  it('存檔必須等掉落佇列結算完，否則存到的是上一次擊殺的進度', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await useGameStore.getState().createCharacter('BossCollectSave', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const char = {
      ...useGameStore.getState().character!,
      currentArea: 'trial-highlands-top',
      currentRegion: 'trial-highlands-top',
      currentFloor: null,
    };
    const deadBoss = {
      templateId: 20, name: '試煉飛龍', level: 30, currentHp: 0, maxHp: 1200,
      attackMin: 25, attackMax: 36, defense: 16, exp: 2500,
      race: 'dragon' as const, size: 'large' as const, element: 'wind' as const,
      isBoss: true, attackType: 'melee' as const, attackRange: 1.5, attackInterval: 1000, _processed: false,
    };
    useGameStore.setState({
      phase: 'combat',
      character: char,
      activeEffects: [],
      adventurerQuests: [bossCollectQuest('boss-collect-a', 'BOSS 素材徵集')],
    });

    processMonsterDeath(() => useGameStore.getState(), s => useGameStore.setState(s), [deadBoss], 0, char as any, [], []);
    // PixiGame.handleMonsterDeath 的存檔時機：等掉落佇列結算完
    await waitForPendingDrops();
    useGameStore.getState().saveState();

    // saveGame 內部有多段 await，localStorage 是最後一步才寫
    await vi.waitFor(() => {
      const prefs = JSON.parse(localStorage.getItem(`mayana_prefs_${char.id}`) ?? 'null');
      expect(prefs?.adventurerQuests?.find((q: AdventurerQuest) => q.id === 'boss-collect-a')?.currentCount).toBe(1);
    });
  });

  it('未擲中時兩張都不動', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const quests = await killTrialDragon();
    expect(quests.find(q => q.id === 'boss-collect-a')?.currentCount).toBe(0);
    expect(quests.find(q => q.id === 'boss-collect-b')?.currentCount).toBe(0);
  });
});
