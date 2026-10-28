import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb } from '../../testing/testDb';
import { useGameStore, talentInitReady, POTION_CONFIG } from '../gameStore';
import { makeBagItem } from '../../models/bagItem';
import { instantiateSkill } from '../../models/skill';
import { CURE_ITEMS } from '../../models/cureItem';
import { gameNow } from '../../core/clock';
import { createPlayerDebuffEffect } from '../../systems/playerDebuffSystem';
import type { MonsterInstance } from '../../models/monster';

/** 沉默（`24-buff-debuff.md` § 24.5.1a／§ 24.10.1）在 store 入口的行為 */

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
const PURIFY = CURE_ITEMS.find(c => c.name === '淨化藥水')!;

function caster(): MonsterInstance {
  return {
    templateId: 69, name: '象牙巫師', level: 34, currentHp: 260, maxHp: 260,
    attackMin: 30, attackMax: 42, defense: 24, exp: 114,
    race: 'normal', size: 'small', element: 'ice', isBoss: false,
    attackType: 'magic', attackRange: 8, attackInterval: 1000,
  };
}

describe('沉默中的技能與道具', () => {
  beforeEach(async () => {
    resetTestDb();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null, bagItems: [] });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter(
      'Silenced', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 },
    );
    useGameStore.getState().stopPersistentLoop();
    useGameStore.getState().stopRegen();
    await talentInitReady();

    const char = useGameStore.getState().character!;
    useGameStore.setState({
      character: { ...char, hp: 1, mp: 500, maxMp: 500 },
      bagItems: [makeBagItem(PURIFY.itemId, 1)!, makeBagItem(POTION_CONFIG.red.itemId, 1)!],
      lastPotionUsedAt: 0,
      lastPotionCooldown: 0,
      skills: [instantiateSkill(HEAL_SKILL_ID)!],
      activeEffects: [createPlayerDebuffEffect('silence', caster(), gameNow(), new Set())],
      combatLogs: [],
    });
  });

  it('手動施放被當場拒絕並說明原因', () => {
    expect(useGameStore.getState().castQuickSlotSkill(HEAL_SKILL_ID)).toBe(false);
    const logs = useGameStore.getState().combatLogs;
    expect(logs[logs.length - 1].text).toBe('沉默中，無法施展技能');
    expect(useGameStore.getState().character!.hp).toBe(1);
  });

  it('castSelfSkill 不施放、不扣 MP', () => {
    expect(useGameStore.getState().castSelfSkill(HEAL_SKILL_ID)).toBe(false);
    expect(useGameStore.getState().character!.mp).toBe(500);
  });

  it('快捷欄手動按藥水照常受理', () => {
    useGameStore.getState().assignQuickSlot(0, { kind: 'potion', potionType: 'red' });
    useGameStore.getState().useQuickSlot(0);
    expect(useGameStore.getState().character!.hp).toBeGreaterThan(1);
    expect(useGameStore.getState().bagItems.find(b => b.itemId === POTION_CONFIG.red.itemId)).toBeUndefined();
  });

  it('快捷欄手動按解除道具照常受理並解除沉默', () => {
    useGameStore.getState().assignQuickSlot(1, { kind: 'bagItem', itemId: PURIFY.itemId });
    useGameStore.getState().useQuickSlot(1);
    expect(useGameStore.getState().activeEffects.filter(e => e.category === 'silence')).toHaveLength(0);
    expect(useGameStore.getState().bagItems.find(b => b.itemId === PURIFY.itemId)).toBeUndefined();
  });

  it('道具照常可用：淨化藥水解除沉默後可施放', () => {
    useGameStore.getState().useCureItem(PURIFY.itemId);
    expect(useGameStore.getState().activeEffects.filter(e => e.category === 'silence')).toHaveLength(0);
    expect(useGameStore.getState().castSelfSkill(HEAL_SKILL_ID)).toBe(true);
  });
});
