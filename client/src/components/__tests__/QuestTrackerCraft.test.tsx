// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { QuestTrackerContent } from '../QuestTracker';
import { useGameStore } from '../../stores/gameStore';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { db } from '../../db/database';
import { loadTemplateCache } from '../../systems/templateSync';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { getItemById } from '../../models/items';
import { bagItemById } from '../../testing/bagFixtures';

/**
 * 製作任務在追蹤視窗的顯示（`36-quest-system.md` § 36.13.4）
 *
 * 配方固定用鋼心劍，但材料一律由 seed 反查 —— § 6A.3 重新分配材料時
 * 這組測試不該變紅。製作不收金幣，角色金幣一律 0。
 */
const RECIPE = EQUIPMENT_SEEDS.find(t => t.name === '鋼心劍')!;
const recipeBag = (amount: number) => RECIPE.craftMaterials!.map(m => bagItemById(m.itemId, amount));

function setChar(gold: number) {
  useGameStore.setState({
    character: {
      name: 'TestHero', className: 'knight', level: 30, exp: 0, expToNext: 5000,
      hp: 200, maxHp: 200, mp: 50, maxMp: 50,
      baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold, currentArea: 'neutral-town', currentZone: 'newbie-neutral',
      currentRegion: 'neutral-town', currentFloor: null, skills: [],
      unspentAttributePoints: 0, quests: [], areaEnteredAt: Date.now(),
      createdAt: Date.now(), userId: 1,
    } as never,
  });
}

describe('QuestTracker — 製作任務（§ 36.13.4）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resetSeedState();
    await seedDatabase();
    await loadTemplateCache();

    setChar(0);
    useGameStore.setState({
      equippedGear: {},
      inventory: [],
      adventurerQuests: [],
      bagItems: recipeBag(10),
      craftQuests: [{ id: `craft-${RECIPE.id}`, templateId: RECIPE.id! }],
    });
  });

  it('以 [製作] 標籤顯示配方名稱與逐項需求', async () => {
    render(<QuestTrackerContent />);

    expect(await screen.findByText('[製作]')).toBeTruthy();
    expect(screen.getByText('鋼心劍')).toBeTruthy();
    for (const mat of RECIPE.craftMaterials!) {
      expect(screen.getByText(getItemById(mat.itemId)!.name)).toBeTruthy();
    }
    expect(screen.queryByText('金幣')).toBeNull();
  });

  it('素材滿足時套用 completable 外框並標示可製作（金幣為 0 也一樣）', async () => {
    const { container } = render(<QuestTrackerContent />);

    await screen.findByText('[製作]');
    await waitFor(() => {
      expect(container.querySelector('.quest-tracker-item.completable')).toBeTruthy();
    });
    expect(screen.getByText('可製作')).toBeTruthy();
  });

  it('素材不足時不亮框，且該項標為缺料', async () => {
    useGameStore.setState({ bagItems: recipeBag(1) });
    const { container } = render(<QuestTrackerContent />);

    await screen.findByText('[製作]');
    expect(container.querySelector('.quest-tracker-item.completable')).toBeNull();
    expect(container.querySelectorAll('.tracker-craft-req.lacking').length).toBeGreaterThan(0);
    expect(screen.queryByText('可製作')).toBeNull();
  });

  it('取消製作任務不扣貢獻（§ 36.13.5）', async () => {
    useGameStore.setState({ guildProgress: { rank: 'C', points: 2000 } });
    render(<QuestTrackerContent />);

    fireEvent.click(await screen.findByText('取消'));

    const state = useGameStore.getState();
    expect(state.craftQuests).toHaveLength(0);
    expect(state.guildProgress).toEqual({ rank: 'C', points: 2000 });
  });
});
