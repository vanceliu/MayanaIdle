import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, type BagItem } from '../gameStore';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import { createPlayerDebuffEffect } from '../../systems/playerDebuffSystem';
import { CURE_ITEMS, getCureItem, hasCurableDebuff, isCureItem } from '../../models/cureItem';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 100_000;

function testCharacter(): Character {
  return {
    name: 'Tester',
    className: 'knight',
    level: 40,
    exp: 0,
    expToNext: 100,
    hp: 300,
    maxHp: 300,
    mp: 100,
    maxMp: 100,
    baseAttributes: { STR: 20, AGI: 15, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 1000,
    currentArea: 'dawn-plains',
    currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains',
    currentFloor: null,
    skills: [],
    unspentAttributePoints: 0,
    quests: [],
    areaEnteredAt: NOW,
    createdAt: NOW,
    userId: 1,
  };
}

function testMonster(): MonsterInstance {
  return {
    templateId: 1, name: '毒蛇', level: 18, currentHp: 100, maxHp: 100,
    attackMin: 40, attackMax: 40, defense: 5, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function setupStore(bagItems: BagItem[], debuffTypes: ('poison' | 'bleed' | 'curse' | 'weaken' | 'slow' | 'stun')[]) {
  useGameStore.setState({
    character: testCharacter(),
    bagItems,
    combatLogs: [],
    activeEffects: debuffTypes.map(t => createPlayerDebuffEffect(t, testMonster(), NOW, new Set())),
  });
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('狀態解除道具定義（§ 24.10.1）', () => {
  it('三種道具的價格、重量、解除範圍符合設計', () => {
    expect(CURE_ITEMS).toHaveLength(3);
    expect(getCureItem('解毒藥水')).toMatchObject({ price: 50, weight: 2, cures: ['dot-poison'] });
    expect(getCureItem('止血繃帶')).toMatchObject({ price: 50, weight: 2, cures: ['dot-bleed'] });
    expect(getCureItem('淨化藥水')).toMatchObject({ price: 500, weight: 3, cures: ['curse', 'weaken'] });
  });

  it('isCureItem 可辨識三種道具', () => {
    expect(isCureItem('解毒藥水')).toBe(true);
    expect(isCureItem('止血繃帶')).toBe(true);
    expect(isCureItem('淨化藥水')).toBe(true);
    expect(isCureItem('紅色藥水')).toBe(false);
  });

  it('hasCurableDebuff 只認對應狀態', () => {
    const poison = createPlayerDebuffEffect('poison', testMonster(), NOW, new Set());
    expect(hasCurableDebuff(getCureItem('解毒藥水')!, [poison], NOW + 100)).toBe(true);
    expect(hasCurableDebuff(getCureItem('止血繃帶')!, [poison], NOW + 100)).toBe(false);
  });
});

describe('useCureItem', () => {
  it('解毒藥水解除中毒並消耗 1 個', () => {
    setupStore([{ name: '解毒藥水', type: 'potion', amount: 2 }], ['poison']);
    useGameStore.getState().useCureItem('解毒藥水');

    const s = useGameStore.getState();
    expect(s.activeEffects).toHaveLength(0);
    expect(s.bagItems.find(b => b.name === '解毒藥水')?.amount).toBe(1);
  });

  it('止血繃帶只解除流血，不影響中毒', () => {
    setupStore([{ name: '止血繃帶', type: 'potion', amount: 1 }], ['poison', 'bleed']);
    useGameStore.getState().useCureItem('止血繃帶');

    const s = useGameStore.getState();
    expect(s.activeEffects.map(e => e.category)).toEqual(['dot-poison']);
    expect(s.bagItems.find(b => b.name === '止血繃帶')).toBeUndefined();
  });

  it('淨化藥水一次全解詛咒與虛弱，但不解減速', () => {
    setupStore([{ name: '淨化藥水', type: 'potion', amount: 1 }], ['curse', 'weaken', 'slow', 'poison']);
    useGameStore.getState().useCureItem('淨化藥水');

    const s = useGameStore.getState();
    expect(s.activeEffects.map(e => e.category).sort()).toEqual(['dot-poison', 'slow']);
  });

  it('只有減速時淨化藥水不可使用（減速改由加速對沖，§ 24.4.6）', () => {
    setupStore([{ name: '淨化藥水', type: 'potion', amount: 1 }], ['slow']);
    useGameStore.getState().useCureItem('淨化藥水');

    const s = useGameStore.getState();
    expect(s.bagItems.find(b => b.name === '淨化藥水')?.amount).toBe(1);
    expect(s.combatLogs.at(-1)?.text).toBe('沒有需要解除的狀態');
  });

  it('無對應 debuff 時不可使用，不消耗道具並顯示提示', () => {
    setupStore([{ name: '解毒藥水', type: 'potion', amount: 1 }], ['bleed']);
    useGameStore.getState().useCureItem('解毒藥水');

    const s = useGameStore.getState();
    expect(s.bagItems.find(b => b.name === '解毒藥水')?.amount).toBe(1);
    expect(s.activeEffects).toHaveLength(1);
    expect(s.combatLogs.at(-1)?.text).toBe('沒有需要解除的狀態');
  });

  it('背包沒有道具時不動作', () => {
    setupStore([], ['poison']);
    useGameStore.getState().useCureItem('解毒藥水');
    expect(useGameStore.getState().activeEffects).toHaveLength(1);
  });
});

describe('暈眩狀態下無法使用任何道具（§ 24.10.1）', () => {
  it('暈眩中無法使用解除道具', () => {
    setupStore([{ name: '解毒藥水', type: 'potion', amount: 1 }], ['poison', 'stun']);
    useGameStore.getState().useCureItem('解毒藥水');

    const s = useGameStore.getState();
    expect(s.bagItems.find(b => b.name === '解毒藥水')?.amount).toBe(1);
    expect(s.combatLogs.at(-1)?.text).toBe('暈眩中，無法使用道具');
  });

  it('暈眩中無法使用 HP 藥水', () => {
    useGameStore.setState({
      character: { ...testCharacter(), hp: 10 },
      bagItems: [{ name: '紅色藥水', type: 'potion', itemTemplateId: 1, amount: 5 }],
      combatLogs: [],
      equippedGear: {},
      lastPotionUsedAt: 0,
      lastPotionCooldown: 0,
      activeEffects: [createPlayerDebuffEffect('stun', testMonster(), NOW, new Set())],
    });
    useGameStore.getState().usePotionByType('red');

    const s = useGameStore.getState();
    expect(s.character?.hp).toBe(10);
    expect(s.bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(5);
  });

  it('暈眩結束後可正常使用道具', () => {
    setupStore([{ name: '解毒藥水', type: 'potion', amount: 1 }], ['poison', 'stun']);
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 2000); // 暈眩 1.5s 已過期
    useGameStore.getState().useCureItem('解毒藥水');

    expect(useGameStore.getState().bagItems.find(b => b.name === '解毒藥水')).toBeUndefined();
  });
});
