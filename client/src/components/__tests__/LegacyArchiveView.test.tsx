import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { LegacyArchiveView } from '../LegacyArchiveView';
import { useGameStore } from '../../stores/gameStore';
import { db } from '../../db/database';
import { SNAPSHOT_VERSION, type LegacyCharacterPayload } from '../../systems/legacyArchive';

/**
 * @vitest-environment jsdom
 *
 * § 45.3 的硬性限制：唯讀、且頁面內只有「返回角色選擇」一個出口。
 */

function makePayload(): LegacyCharacterPayload {
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    character: {
      name: '老兵', uuid: 'uuid-legacy', className: 'knight', level: 42, exp: 500, gold: 12345,
      hp: 250, maxHp: 300, mp: 40, maxMp: 50,
      baseAttributes: { STR: 14, VIT: 16 }, bonusAttributes: { STR: 4, VIT: 0 },
      unspentAttributePoints: 2, currentRegion: 'dawn-plains', createdAt: 1000,
    },
    skills: [{ id: 'wind_blade', name: '風刃', level: 3 }],
    quests: [],
    equipped: [{ name: '鋼劍', enhancement: 7, quality: 15, affixes: [{ display: '力量 +3' }] }],
    inventory: [],
    bagItems: [{ name: '紅藥水', type: 'potion', amount: 7 }],
    personalStorageItems: [],
    personalWarehouseEquipment: [],
    statistics: { monstersKilled: 8888 },
    contribution: 350,
  };
}

async function seedArchive(payload: Partial<LegacyCharacterPayload> = {}) {
  await db.legacyArchives.add({
    userId: 1, type: 'character', label: '老兵', className: 'knight', level: 42,
    dataVersion: 2, archivedAt: 1_700_000_000_000,
    payload: JSON.stringify({ ...makePayload(), ...payload }),
  });
}

describe('LegacyArchiveView', () => {
  beforeEach(async () => {
    cleanup();
    if (db.isOpen()) db.close();
    await db.delete();
    await db.open();
    useGameStore.setState({ userId: 1, phase: 'legacy' });
  });

  it('沒有紀錄時顯示空狀態', async () => {
    render(<LegacyArchiveView />);
    await waitFor(() => expect(screen.getByText('沒有任何遺產紀錄')).toBeDefined());
  });

  it('顯示角色的完整狀態，含技能、裝備、統計', async () => {
    await seedArchive();
    render(<LegacyArchiveView />);

    await waitFor(() => expect(screen.getByText('風刃')).toBeDefined());
    expect(screen.getAllByText('老兵').length).toBeGreaterThan(0);
    expect(screen.getByText('鋼劍')).toBeDefined();
    expect(screen.getByText('力量 +3')).toBeDefined();
    expect(screen.getByText('8,888')).toBeDefined();   // 殺敵數
    expect(screen.getByText('350')).toBeDefined();     // 貢獻度
    expect(screen.getByText('12,345')).toBeDefined();  // 金幣
  });

  it('快照缺少的統計欄位顯示「—」而不是 0', async () => {
    await seedArchive({ statistics: { monstersKilled: 5 }, contribution: null });
    render(<LegacyArchiveView />);

    await waitFor(() => expect(screen.getByText('5')).toBeDefined());
    // BOSS 討伐等未封存的欄位
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('唯一的出口是返回角色選擇，沒有任何前往遊玩畫面的按鈕', async () => {
    await seedArchive();
    render(<LegacyArchiveView />);
    await waitFor(() => expect(screen.getByText('鋼劍')).toBeDefined());

    const buttons = [...document.querySelectorAll('button')].map(b => b.textContent ?? '');
    const exits = buttons.filter(t => /返回|進入|開始|遊玩|復活|取出/.test(t));
    expect(exits).toEqual(['← 返回角色選擇']);

    fireEvent.click(screen.getByText('← 返回角色選擇'));
    expect(useGameStore.getState().phase).toBe('characterSelect');
  });

  it('可刪除單筆遺產', async () => {
    await seedArchive();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LegacyArchiveView />);
    await waitFor(() => expect(screen.getByText('鋼劍')).toBeDefined());

    fireEvent.click(screen.getByText('刪除'));

    await waitFor(() => expect(screen.getByText('沒有任何遺產紀錄')).toBeDefined());
    expect(await db.legacyArchives.count()).toBe(0);
  });

  it('payload 損毀時只顯示無法讀取，不讓整頁壞掉', async () => {
    await db.legacyArchives.add({
      userId: 1, type: 'character', label: '壞掉的紀錄', dataVersion: 1,
      archivedAt: 1, payload: '{ not json',
    });
    render(<LegacyArchiveView />);

    await waitFor(() => expect(screen.getByText('此紀錄無法讀取')).toBeDefined());
  });
});
