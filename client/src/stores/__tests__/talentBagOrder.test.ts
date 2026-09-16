import { describe, it, expect, beforeEach, vi } from 'vitest';
import { repo, resetTestDb } from '../../testing/testDb';
import { useGameStore } from '../gameStore';

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

/**
 * 天賦分頁的格子位置走持久層（`35-inventory-constraints.md` § 35.21.1、§ 35.17）。
 *
 * 原本直接寫 localStorage，線上模式因此把版面留在瀏覽器裡 ——
 * 換一台裝置登入就整個散掉。現在與一般分頁一樣經 `GameRepository`，
 * 線上模式即存在 server 的 `talent_bag_layouts`。
 */
describe('天賦分頁的位置', () => {
  let characterId: number;

  beforeEach(async () => {
    resetTestDb();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null });
    await useGameStore.getState().initUser();
    await useGameStore.getState().createCharacter(
      'Talenter', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 },
    );
    useGameStore.getState().stopPersistentLoop();
    useGameStore.getState().stopRegen();
    characterId = useGameStore.getState().character!.id!;
  });

  it('新角色沒有位置表', () => {
    expect(useGameStore.getState().talentBagOrder).toEqual({});
  });

  it('設定順序會寫進持久層', async () => {
    useGameStore.getState().setTalentBagOrder({ 't3': 0, 't1': 4 });

    expect(useGameStore.getState().talentBagOrder).toEqual({ 't3': 0, 't1': 4 });
    await vi.waitFor(async () => {
      expect(await repo.getTalentBagLayout(characterId)).toEqual({ 't3': 0, 't1': 4 });
    });
  });

  it('重新載入角色時把位置讀回來', async () => {
    useGameStore.getState().setTalentBagOrder({ 't7': 2 });
    await vi.waitFor(async () => {
      expect(await repo.getTalentBagLayout(characterId)).toEqual({ 't7': 2 });
    });

    useGameStore.setState({ talentBagOrder: {} });
    await useGameStore.getState().selectCharacter(characterId);

    expect(useGameStore.getState().talentBagOrder).toEqual({ 't7': 2 });
  });

  it('壞掉的內容當作沒有位置表，不讓載入流程炸掉', async () => {
    await repo.putTalentBagLayout(characterId, ['not', 'an', 'object']);

    await useGameStore.getState().selectCharacter(characterId);

    expect(useGameStore.getState().talentBagOrder).toEqual({});
  });
});
