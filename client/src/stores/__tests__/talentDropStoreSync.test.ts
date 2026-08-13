/**
 * 掉落的鑲材與天賦格要**立刻**進 store（`51-auto-talent.md` § 51.6）。
 *
 * 兩者走獨立實例表，擊殺結算只寫 DB；背包的「天賦」分頁與天賦面板讀的是
 * `talentStore`，不同步重載的話玩家要等下次載入角色才看得到剛掉的東西 ——
 * 而戰鬥日誌已經寫了「獲得鑲材」，看起來就像掉落被吃掉了。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import type { DropResult } from '../../systems/drops';
import { createDefaultStatistics } from '../../models/statistics';

const rollDropsMock = vi.fn(async (): Promise<DropResult> => ({ gold: 0, items: [] }));

vi.mock('../../systems/drops', async () => {
  const actual = await vi.importActual<typeof import('../../systems/drops')>('../../systems/drops');
  return {
    ...actual,
    rollDrops: () => rollDropsMock(),
    rollBossDrops: () => rollDropsMock(),
  };
});

/** rng 恆為 0 → 每一階都命中，鑲材與天賦格必定掉 */
vi.mock('../../systems/talentDrops', async () => {
  const actual = await vi.importActual<typeof import('../../systems/talentDrops')>('../../systems/talentDrops');
  return {
    ...actual,
    rollTalentAffixDrops: (areaLevel: number, isBoss: boolean) =>
      actual.rollTalentAffixDrops(areaLevel, isBoss, 1, () => 0),
    rollTalentSlotDrop: (areaLevel: number, isBoss: boolean) =>
      actual.rollTalentSlotDrop(areaLevel, isBoss, 1, () => 0),
  };
});

import { useGameStore, processMonsterDeath, waitForPendingDrops } from '../gameStore';
import { useTalentStore } from '../talentStore';

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

const deadBoss = {
  templateId: 1,
  name: '不死殭屍王',
  level: 40,
  currentHp: -1,
  maxHp: 100,
  attackMin: 1,
  attackMax: 2,
  defense: 0,
  exp: 10,
  race: 'normal' as const,
  size: 'small' as const,
  element: 'none' as const,
  isBoss: true,
  attackType: 'melee' as const,
  attackRange: 1.5,
  attackInterval: 1000,
  _processed: false,
};

/**
 * `initTalentAndMailbox` 在 `createCharacter` 裡是 fire-and-forget，
 * 不等它結束就開打的話，它會在擊殺途中才把 store 載好，測試就測不到東西。
 */
async function waitForTalentInit() {
  for (let i = 0; i < 100; i++) {
    if (useTalentStore.getState().affixes.length > 0) return;
    await new Promise(r => setTimeout(r, 0));
  }
  throw new Error('天賦起始配置沒有載入');
}

async function killBoss() {
  const char = useGameStore.getState().character!;
  const inCombat = { ...char, currentArea: 'meadow', currentRegion: 'meadow' };
  useGameStore.setState({ phase: 'combat', character: inCombat, activeEffects: [] });

  processMonsterDeath(
    () => useGameStore.getState(),
    (s: any) => useGameStore.setState(s),
    [{ ...deadBoss }],
    0,
    inCombat as any,
    [],
    [],
  );
  await waitForPendingDrops();
}

describe('天賦掉落與 store 同步', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    rollDropsMock.mockReset();
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
      statistics: createDefaultStatistics(),
    });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter('DropSync', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
  });

  afterEach(async () => {
    await waitForPendingDrops();
    vi.restoreAllMocks();
  });

  it('掉落的鑲材立刻出現在 store，不必重新載入角色', async () => {
    // 模擬玩家已經在遊戲裡：起始配置載完才開打
    await waitForTalentInit();
    const characterId = useGameStore.getState().character!.id!;
    const before = useTalentStore.getState().affixes.length;

    await killBoss();

    const dbAffixes = await db.talentAffixes.where('characterId').equals(characterId).count();
    expect(dbAffixes).toBeGreaterThan(before);
    expect(useTalentStore.getState().affixes).toHaveLength(dbAffixes);
  });

  /* 天賦格與鑲材寫在同一段，兩張表都要跟 DB 對得起來 */
  it('擊殺後 store 與 DB 完全一致', async () => {
    await waitForTalentInit();
    await killBoss();

    const characterId = useGameStore.getState().character!.id!;
    const dbAffixes = await db.talentAffixes.where('characterId').equals(characterId).count();
    const dbSlots = await db.talentSlots.where('characterId').equals(characterId).count();

    expect(useTalentStore.getState().affixes).toHaveLength(dbAffixes);
    expect(useTalentStore.getState().slots).toHaveLength(dbSlots);
  });

});
