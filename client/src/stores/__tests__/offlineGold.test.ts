import { describe, it, expect, beforeEach } from 'vitest';
import { db, resetTestDb } from '../../testing/testDb';
import { useGameStore } from '../gameStore';
import { claimMail } from '../../systems/mailbox';
import { OFFLINE_GOLD_ENABLED, offlineGoldMailKey } from '../../systems/offlineGold';

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

const HOUR = 60 * 60 * 1000;

async function createOfflineCharacter(offlineMs: number): Promise<{ id: number; lastSeenAt: number }> {
  await useGameStore.getState().createCharacter('Idle', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
  const id = useGameStore.getState().character!.id!;
  await useGameStore.getState().logout();
  const lastSeenAt = Date.now() - offlineMs;
  // 狩獵速率 1 金幣／秒
  await db.characters.update(id, { lastSeenAt, huntGold: 3600, huntMs: HOUR, gold: 100 });
  return { id, lastSeenAt };
}

describe('載入角色時的離線金幣（`04-character.md` § 4.12）', () => {
  beforeEach(async () => {
    resetTestDb();
    localStorage.clear();
    useGameStore.setState({ phase: 'title', userId: null, characterList: [], character: null });
    await useGameStore.getState().initUser();
  });

  it.runIf(OFFLINE_GOLD_ENABLED)('寄出金幣信、狩獵累計歸零，領取後入角色金幣', async () => {
    const { id, lastSeenAt } = await createOfflineCharacter(2 * HOUR);
    await useGameStore.getState().selectCharacter(id);

    const mails = (await db.mailbox.toArray()).filter(m => m.characterId === id);
    const mail = mails.find(m => m.sourceKey === offlineGoldMailKey(lastSeenAt));
    expect(mail?.items).toEqual([{ type: 'gold', amount: 3600 }]);

    const char = useGameStore.getState().character!;
    expect(char.huntGold).toBe(0);
    expect(char.huntMs).toBe(0);
    const stored = await db.characters.get(id);
    expect(stored?.huntMs).toBe(0);
    expect(stored?.lastSeenAt).toBeGreaterThan(lastSeenAt);

    expect(await claimMail(mail!.id!)).toBe('claimed');
    expect(useGameStore.getState().character!.gold).toBe(3700);
    await useGameStore.getState().logout();
  });

  it.skipIf(OFFLINE_GOLD_ENABLED)('開關關閉：不寄信，狩獵累計照常歸零', async () => {
    const { id } = await createOfflineCharacter(2 * HOUR);
    await useGameStore.getState().selectCharacter(id);

    const mails = (await db.mailbox.toArray()).filter(m => m.sourceKey.startsWith('offline-gold-'));
    expect(mails).toHaveLength(0);
    expect(useGameStore.getState().character!.huntMs).toBe(0);
    expect((await db.characters.get(id))?.huntMs).toBe(0);
    await useGameStore.getState().logout();
  });

  it('離線未滿 10 分鐘不寄信，狩獵累計保留', async () => {
    const { id } = await createOfflineCharacter(5 * 60 * 1000);
    await useGameStore.getState().selectCharacter(id);

    const mails = (await db.mailbox.toArray()).filter(m => m.sourceKey.startsWith('offline-gold-'));
    expect(mails).toHaveLength(0);
    expect(useGameStore.getState().character!.huntMs).toBe(HOUR);
    await useGameStore.getState().logout();
  });
});
