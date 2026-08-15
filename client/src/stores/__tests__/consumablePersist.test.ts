import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore, POTION_CONFIG, SPEED_POTION_CONFIG, talentInitReady } from '../gameStore';
import { makeBagItem } from '../../models/bagItem';
import { instantiateSkill } from '../../models/skill';
import { CURE_ITEMS } from '../../models/cureItem';
import { PLAYER_DEBUFF_DEFS } from '../../models/playerDebuff';
import { createPlayerDebuffEffect } from '../../systems/playerDebuffSystem';
import type { MonsterInstance } from '../../models/monster';

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

const HEAL_SKILL_ID = 'heal';
const BUFF_SKILL_ID = 'protect-shield';
const HEAL_MP_COST = instantiateSkill(HEAL_SKILL_ID)!.mpCost;
const BUFF_MP_COST = instantiateSkill(BUFF_SKILL_ID)!.mpCost;
/** 兩招都放得起即可，數值本身不受規格約束 */
const MP_POOL = (HEAL_MP_COST + BUFF_MP_COST) * 2;
const START_HP = 1;
const STOCK = 5;

const POISON_CURE = CURE_ITEMS.find(c => c.cures.includes(PLAYER_DEBUFF_DEFS.poison.category))!;

function testMonster(): MonsterInstance {
  return {
    templateId: 1, name: '毒蛇', level: 18, currentHp: 100, maxHp: 100,
    attackMin: 40, attackMax: 40, defense: 5, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

async function bagAmount(characterId: number, itemId: number): Promise<number> {
  const rows = await db.characterBag.where('characterId').equals(characterId).toArray();
  return rows.find(r => r.itemTemplateId === itemId)?.amount ?? 0;
}

/**
 * 消耗品與自我施法的落地（`18-data-schema.md`）：
 * 扣道具、改 HP／MP 的動作必須自己存檔，不可依賴擊殺後的順帶存檔。
 */
describe('消耗品與自我施法的存檔', () => {
  let characterId: number;

  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter(
      'Consumer', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 },
    );
    // 迴圈與回血會插入自己的存檔，數值斷言要求場面固定
    useGameStore.getState().stopPersistentLoop();
    useGameStore.getState().stopRegen();
    await talentInitReady();

    const char = useGameStore.getState().character!;
    characterId = char.id!;

    useGameStore.setState({
      character: { ...char, hp: START_HP, mp: MP_POOL, maxMp: MP_POOL },
      bagItems: [
        makeBagItem(POTION_CONFIG.red.itemId, STOCK)!,
        makeBagItem(POTION_CONFIG.white.itemId, STOCK)!,
        makeBagItem(SPEED_POTION_CONFIG.green.itemId, STOCK)!,
        makeBagItem(POISON_CURE.itemId, STOCK)!,
      ],
      skills: [instantiateSkill(HEAL_SKILL_ID)!, instantiateSkill(BUFF_SKILL_ID)!],
      activeEffects: [],
      lastPotionUsedAt: 0,
      lastPotionCooldown: 0,
      combatLogs: [],
    });

    // DB 先落地成起始版：建角寫進去的是另一組數字，不覆蓋就看不出「有沒有存」
    useGameStore.getState().saveState();
    await vi.waitFor(async () => {
      const row = await db.characters.get(characterId);
      expect(row!.hp).toBe(START_HP);
      expect(row!.mp).toBe(MP_POOL);
      expect(await bagAmount(characterId, POTION_CONFIG.red.itemId)).toBe(STOCK);
      expect(await bagAmount(characterId, POISON_CURE.itemId)).toBe(STOCK);
    });
  });

  it('usePotion 的 HP 與藥水消耗寫進 DB', async () => {
    useGameStore.getState().usePotion();

    const hp = useGameStore.getState().character!.hp;
    expect(hp).toBeGreaterThan(START_HP);

    await vi.waitFor(async () => {
      expect((await db.characters.get(characterId))!.hp).toBe(hp);
      expect(await bagAmount(characterId, POTION_CONFIG.white.itemId)).toBe(STOCK - 1);
    });
  });

  it('usePotionByType 的 HP 與藥水消耗寫進 DB', async () => {
    useGameStore.getState().usePotionByType('red');

    const hp = useGameStore.getState().character!.hp;
    expect(hp).toBeGreaterThan(START_HP);

    await vi.waitFor(async () => {
      expect((await db.characters.get(characterId))!.hp).toBe(hp);
      expect(await bagAmount(characterId, POTION_CONFIG.red.itemId)).toBe(STOCK - 1);
    });
  });

  it('useSpeedPotion 的藥水消耗寫進 DB', async () => {
    useGameStore.getState().useSpeedPotion('green');

    expect(useGameStore.getState().activeEffects.some(e => e.category === 'speed')).toBe(true);

    await vi.waitFor(async () => {
      expect(await bagAmount(characterId, SPEED_POTION_CONFIG.green.itemId)).toBe(STOCK - 1);
    });
  });

  it('useCureItem 的道具消耗寫進 DB', async () => {
    useGameStore.setState({
      activeEffects: [createPlayerDebuffEffect('poison', testMonster(), Date.now(), new Set())],
    });

    useGameStore.getState().useCureItem(POISON_CURE.itemId);

    expect(useGameStore.getState().activeEffects).toHaveLength(0);

    await vi.waitFor(async () => {
      expect(await bagAmount(characterId, POISON_CURE.itemId)).toBe(STOCK - 1);
    });
  });

  it('castSelfSkill 施放治癒後的 HP 與 MP 寫進 DB', async () => {
    expect(useGameStore.getState().castSelfSkill(HEAL_SKILL_ID)).toBe(true);

    const hp = useGameStore.getState().character!.hp;
    expect(hp).toBeGreaterThan(START_HP);

    await vi.waitFor(async () => {
      const row = await db.characters.get(characterId);
      expect(row!.hp).toBe(hp);
      expect(row!.mp).toBe(MP_POOL - HEAL_MP_COST);
    });
  });

  it('castSelfSkill 施放增益後的 MP 寫進 DB', async () => {
    expect(useGameStore.getState().castSelfSkill(BUFF_SKILL_ID)).toBe(true);

    await vi.waitFor(async () => {
      expect((await db.characters.get(characterId))!.mp).toBe(MP_POOL - BUFF_MP_COST);
    });
  });
});
