import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore, processMonsterDeath, waitForPendingDrops } from '../gameStore';

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

describe('processMonsterDeath — DOT kill triggers drops', () => {
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
      monsters: [],
      storedEquipment: [],
      storedMaterials: [],
      warehouseGold: 0,
      scriptRules: [],
      quickSlots: [null, null, null, null, null],
      combatLogs: [],
      gameLoopId: null,
      hpRegenId: null,
      mpRegenId: null,
      activeEffects: [],
    });
    await useGameStore.getState().initUser();
  });

  afterEach(async () => {
    await waitForPendingDrops();
  });

  it('should mark monster as _processed and award EXP on death', async () => {
    await useGameStore.getState().createCharacter('DotTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });

    const char = useGameStore.getState().character!;
    const initialExp = char.exp;

    // 已死亡但未處理的怪物（模擬 DOT 把 HP 扣到 0 以下）
    const deadMonster = {
      templateId: 1,
      name: '測試怪物',
      level: 5,
      currentHp: -9,
      maxHp: 100,
      attackMin: 1,
      attackMax: 2,
      defense: 0,
      exp: 100,
      race: 'normal' as const,
      size: 'small' as const,
      element: 'none' as const,
      isBoss: false,
      attackType: 'melee' as const,
      attackRange: 1.5,
      attackInterval: 1000,
      _processed: false,
    };

    const monsters = [deadMonster];
    const logs: any[] = [];

    // 設定 store 狀態
    useGameStore.setState({
      phase: 'combat',
      character: { ...char, currentArea: 'meadow', currentRegion: 'meadow' },
      activeEffects: [],
    });

    const get = () => useGameStore.getState();
    const set = (s: any) => useGameStore.setState(s);

    // 呼叫 processMonsterDeath — 模擬 DOT 殺死怪物後的處理
    const result = processMonsterDeath(get, set, monsters, 0, { ...char, currentArea: 'meadow', currentRegion: 'meadow' } as any, logs, []);

    // 怪物應被標記為 _processed
    expect(monsters[0]._processed).toBe(true);

    // 日誌應包含擊敗訊息
    const defeatLog = result.logs.find(l => l.text.includes('被擊敗'));
    expect(defeatLog).toBeDefined();

    // 應獲得經驗值（exp * 3 = 300，可能觸發升級消耗部分 exp）
    expect(result.char.exp).not.toBe(initialExp);

    // 日誌應包含經驗值獲得
    const expLog = result.logs.find(l => l.text.includes('獲得 300 經驗值'));
    expect(expLog).toBeDefined();
  });

  it('should clear debuffs on dead monster', async () => {
    await useGameStore.getState().createCharacter('DebuffClear', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });

    const char = useGameStore.getState().character!;

    const deadMonster = {
      templateId: 1,
      name: '流血死怪',
      level: 10,
      currentHp: -5,
      maxHp: 200,
      attackMin: 5,
      attackMax: 10,
      defense: 3,
      exp: 200,
      race: 'normal' as const,
      size: 'small' as const,
      element: 'none' as const,
      isBoss: false,
      attackType: 'melee' as const,
      attackRange: 1.5,
      attackInterval: 1000,
      _processed: false,
    };

    // 怪物身上的 DOT debuff
    const bleedEffect = {
      id: 'bleed-1',
      sourceSkillId: 'skill-1',
      sourceSkillName: '裂傷斬',
      category: 'bleed',
      type: 'debuff' as const,
      target: 'monster' as const,
      targetIdx: 0,
      dot: { damage: 10, element: 'none' as const, interval: 1000, totalDuration: 5000 },
      startTime: Date.now(),
      duration: 5000,
      tags: ['bleeding'],
      name: '流血',
      description: '',
    };

    useGameStore.setState({
      phase: 'combat',
      character: { ...char, currentArea: 'meadow', currentRegion: 'meadow' },
      activeEffects: [bleedEffect],
    });

    const monsters = [deadMonster];
    const get = () => useGameStore.getState();
    const set = (s: any) => useGameStore.setState(s);

    processMonsterDeath(get, set, monsters, 0, { ...char, currentArea: 'meadow', currentRegion: 'meadow' } as any, [], []);

    // debuff 應被清除
    const afterEffects = useGameStore.getState().activeEffects;
    const monsterDebuffs = afterEffects.filter(e => e.target === 'monster' && e.targetIdx === 0);
    expect(monsterDebuffs.length).toBe(0);
  });

  it('should work for multiple dead monsters (AOE + DOT scenario)', async () => {
    await useGameStore.getState().createCharacter('AoeTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });

    const char = useGameStore.getState().character!;

    const monster1 = {
      templateId: 1, name: '怪物A', level: 5, currentHp: -3, maxHp: 50,
      attackMin: 1, attackMax: 2, defense: 0, exp: 50,
      race: 'normal' as const, size: 'small' as const, element: 'none' as const,
      isBoss: false, attackType: 'melee' as const, attackRange: 1.5, attackInterval: 1000, _processed: false,
    };
    const monster2 = {
      templateId: 2, name: '怪物B', level: 5, currentHp: -1, maxHp: 80,
      attackMin: 2, attackMax: 4, defense: 1, exp: 80,
      race: 'normal' as const, size: 'small' as const, element: 'none' as const,
      isBoss: false, attackType: 'melee' as const, attackRange: 1.5, attackInterval: 1000, _processed: false,
    };
    // 第三隻還活著
    const monster3 = {
      templateId: 3, name: '怪物C', level: 5, currentHp: 50, maxHp: 80,
      attackMin: 2, attackMax: 4, defense: 1, exp: 80,
      race: 'normal' as const, size: 'small' as const, element: 'none' as const,
      isBoss: false, attackType: 'melee' as const, attackRange: 1.5, attackInterval: 1000, _processed: false,
    };

    const monsters = [monster1, monster2, monster3];

    useGameStore.setState({
      phase: 'combat',
      character: { ...char, currentArea: 'meadow', currentRegion: 'meadow' },
      activeEffects: [],
    });

    const get = () => useGameStore.getState();
    const set = (s: any) => useGameStore.setState(s);
    let updatedChar = { ...char, currentArea: 'meadow', currentRegion: 'meadow' } as any;
    let logs: any[] = [];

    // 逐隻處理死亡怪物（模擬 DOT timer 或 Player Attack 中的 loop）
    const deadIndices = monsters
      .map((m, idx) => (m.currentHp <= 0 && !m._processed) ? idx : -1)
      .filter(idx => idx !== -1);

    for (const deadIdx of deadIndices) {
      ({ char: updatedChar, logs } = processMonsterDeath(get, set, monsters, deadIdx, updatedChar, logs, []));
    }

    // 怪物A、B 應被標記 _processed，C 不變
    expect(monsters[0]._processed).toBe(true);
    expect(monsters[1]._processed).toBe(true);
    expect(monsters[2]._processed).toBe(false);

    // 經驗值：(50 + 80) * 3 = 390，可能觸發升級消耗部分 exp
    // 驗證日誌正確記錄經驗值獲得
    const expLogs = logs.filter(l => l.text.includes('經驗值'));
    expect(expLogs.length).toBe(2);

    // 日誌中兩次「被擊敗」
    const defeatLogs = logs.filter(l => l.text.includes('被擊敗'));
    expect(defeatLogs.length).toBe(2);
  });

  it('should update an adventurer quest using the concrete dungeon floor id', async () => {
    await useGameStore.getState().createCharacter('FloorQuestTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });

    const char = {
      ...useGameStore.getState().character!,
      currentArea: 'ivory-tower',
      currentRegion: 'ivory-tower',
      currentFloor: 1,
    };
    const deadMonster = {
      templateId: 68,
      name: '冰霜蜘蛛',
      level: 33,
      currentHp: 0,
      maxHp: 250,
      attackMin: 25,
      attackMax: 36,
      defense: 16,
      exp: 510,
      race: 'normal' as const,
      size: 'small' as const,
      element: 'ice' as const,
      isBoss: false,
      attackType: 'melee' as const,
      attackRange: 1.5,
      attackInterval: 1000,
      _processed: false,
    };

    useGameStore.setState({
      phase: 'combat',
      character: char,
      activeEffects: [],
      adventurerQuests: [
        {
          id: 'floor-1-quest',
          type: 'errand',
          difficulty: 'B',
          status: 'active',
          title: '區域清掃',
          description: '象牙塔 1F',
          targetArea: 'ivory-tower-1f',
          targetCount: 20,
          currentCount: 0,
          reward: { type: 'gold', amount: 1000 },
          contributionPoints: 47,
        },
        {
          id: 'floor-2-quest',
          type: 'errand',
          difficulty: 'B',
          status: 'active',
          title: '其他樓層',
          description: '象牙塔 2F',
          targetArea: 'ivory-tower-2f',
          targetCount: 20,
          currentCount: 0,
          reward: { type: 'gold', amount: 1000 },
          contributionPoints: 47,
        },
      ],
    });

    const get = () => useGameStore.getState();
    const set = (s: any) => useGameStore.setState(s);
    processMonsterDeath(get, set, [deadMonster], 0, char, [], []);

    await waitForPendingDrops();

    const quests = useGameStore.getState().adventurerQuests;
    expect(quests.find(q => q.id === 'floor-1-quest')?.currentCount).toBe(1);
    expect(quests.find(q => q.id === 'floor-2-quest')?.currentCount).toBe(0);
  });
});
