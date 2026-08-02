import { describe, it, expect, beforeEach } from 'vitest';
import { useMonsterHudStore, type MonsterHudEntry } from '../monsterHudStore';

function entry(overrides: Partial<MonsterHudEntry> = {}): MonsterHudEntry {
  return { id: 'm_1', name: '石像鬼', currentHp: 30, maxHp: 60, isBoss: false, ...overrides };
}

describe('monsterHudStore', () => {
  beforeEach(() => {
    useMonsterHudStore.setState({ entries: [], targetId: null });
  });

  it('publish 寫入快照與目標 id', () => {
    useMonsterHudStore.getState().publish([entry()], 'm_1');

    const state = useMonsterHudStore.getState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].name).toBe('石像鬼');
    expect(state.targetId).toBe('m_1');
  });

  it('內容相同時不替換 entries 參考（避免無謂 re-render）', () => {
    useMonsterHudStore.getState().publish([entry()], 'm_1');
    const before = useMonsterHudStore.getState().entries;

    useMonsterHudStore.getState().publish([entry()], 'm_1');
    expect(useMonsterHudStore.getState().entries).toBe(before);
  });

  it('HP 變動時更新快照', () => {
    useMonsterHudStore.getState().publish([entry()], 'm_1');
    const before = useMonsterHudStore.getState().entries;

    useMonsterHudStore.getState().publish([entry({ currentHp: 20 })], 'm_1');
    expect(useMonsterHudStore.getState().entries).not.toBe(before);
    expect(useMonsterHudStore.getState().entries[0].currentHp).toBe(20);
  });

  it('怪物數量變動時更新快照', () => {
    useMonsterHudStore.getState().publish([entry()], null);
    useMonsterHudStore.getState().publish([entry(), entry({ id: 'm_2', name: '哥布林' })], null);

    expect(useMonsterHudStore.getState().entries).toHaveLength(2);
  });

  it('只有目標改變時也會更新', () => {
    useMonsterHudStore.getState().publish([entry()], null);
    useMonsterHudStore.getState().publish([entry()], 'm_1');

    expect(useMonsterHudStore.getState().targetId).toBe('m_1');
  });

  it('clear 清空快照', () => {
    useMonsterHudStore.getState().publish([entry()], 'm_1');
    useMonsterHudStore.getState().clear();

    const state = useMonsterHudStore.getState();
    expect(state.entries).toHaveLength(0);
    expect(state.targetId).toBeNull();
  });

  it('已是空狀態時 clear 不替換 entries 參考', () => {
    const before = useMonsterHudStore.getState().entries;
    useMonsterHudStore.getState().clear();
    expect(useMonsterHudStore.getState().entries).toBe(before);
  });
});
