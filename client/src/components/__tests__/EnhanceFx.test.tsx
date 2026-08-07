import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TownBlacksmith, ENHANCE_FX_DURATION_MS } from '../town/TownBlacksmith';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { useGameStore } from '../../stores/gameStore';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { db } from '../../db/database';
import { loadTemplateCache } from '../../systems/templateSync';
import { bagItemById } from '../../testing/bagFixtures';

/**
 * @vitest-environment jsdom
 */

/**
 * 強化演出（`48-vfx.md` § 48.4）。
 *
 * 這裡驗的是「演出不影響判定」與「三段各自掛對 class」，
 * 成功率與安定值本身由 `enhancement` 的單元測試負責，不在這裡重測。
 */

const WEAPON_SCROLL_ID = 7;

/** 鋼心劍：安定值 6，+3 → +4 落在安定值內，+6 → +7 超出 */
function sword(enhancement: number) {
  const tmpl = EQUIPMENT_SEEDS.find(t => t.name === '鋼心劍')!;
  return {
    id: 101,
    templateId: tmpl.id!,
    name: tmpl.name,
    type: tmpl.type,
    slot: tmpl.slot,
    isTwoHanded: tmpl.isTwoHanded,
    smallMonsterDamage: tmpl.smallMonsterDamage,
    largeMonsterDamage: tmpl.largeMonsterDamage,
    quality: 0,
    enhancement,
    stability: 6,
    affixes: [],
    ownerId: 1,
    equipped: false,
  } as never;
}

function setup(enhancement: number) {
  useGameStore.setState({
    character: {
      name: 'FxHero', className: 'knight', level: 30, exp: 0, expToNext: 5000,
      hp: 200, maxHp: 200, mp: 50, maxMp: 50,
      baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold: 500000,
      currentArea: 'neutral-town', currentZone: 'newbie-neutral',
      currentRegion: 'neutral-town', currentFloor: null,
      skills: [], unspentAttributePoints: 0, quests: [],
      areaEnteredAt: Date.now(), createdAt: Date.now(), userId: 1, id: 1,
    } as never,
    equippedGear: {},
    inventory: [sword(enhancement)],
    bagItems: [bagItemById(WEAPON_SCROLL_ID, 5)],
    craftQuests: [],
  });
}

const clickEnhance = () => fireEvent.click(screen.getByRole('button', { name: /→ \+/ }));

describe('強化演出（§ 48.4）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resetSeedState();
    await seedDatabase();
    await loadTemplateCache();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('可強化的卡片維持待命呼吸，安定值內外共用同一種', () => {
    setup(3);
    const { container } = render(<TownBlacksmith />);
    expect(container.querySelectorAll('.enh-standby')).toHaveLength(1);

    setup(6); // 超過安定值，仍是同一個 class
    render(<TownBlacksmith />);
    expect(document.querySelectorAll('.enh-standby').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.enh-risky')).toHaveLength(0);
  });

  it('安定值內成功只給白閃，沒有金色與光環', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    setup(3);
    const { container } = render(<TownBlacksmith />);
    clickEnhance();

    expect(container.querySelector('.enh-flash-soft')).not.toBeNull();
    expect(container.querySelector('.enh-flash-gold')).toBeNull();
    expect(container.querySelector('.enh-ring')).toBeNull();
    expect(screen.getByText('+4')).toBeDefined();
  });

  it('超過安定值成功：白閃 + 金色 + 兩圈光環 + +N', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    setup(6);
    const { container } = render(<TownBlacksmith />);
    clickEnhance();

    expect(container.querySelector('.enh-flash-soft')).not.toBeNull();
    expect(container.querySelector('.enh-flash-gold')).not.toBeNull();
    expect(container.querySelectorAll('.enh-ring')).toHaveLength(2);
    expect(screen.getByText('+7')).toBeDefined();
  });

  it('失敗：裝備立刻從清單移除，碎裂由殘影卡片演完', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setup(6);
    const { container } = render(<TownBlacksmith />);
    clickEnhance();

    // 判定不因演出延後（§ 48.1）：庫存當下就空了
    expect(useGameStore.getState().inventory).toHaveLength(0);

    const ghost = screen.getByTestId('enh-fx-ghost');
    expect(ghost.className).toContain('enh-shake');
    expect(ghost.className).toContain('enh-breaking');
    expect(ghost.querySelector('.enh-flash-soft')).not.toBeNull();
    expect(ghost.querySelector('.enh-flash-red')).not.toBeNull();
    expect(container.querySelectorAll('.enh-shard')).toHaveLength(6);
    // 碎片各自帶編號 class，時序靠 CSS，不依賴 DOM 位置
    expect(container.querySelectorAll('.enh-shard--1')).toHaveLength(1);
    expect(container.querySelectorAll('.enh-shard--6')).toHaveLength(1);
  });

  it('演出結束後殘影收掉，不留在畫面上', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setup(6);
    render(<TownBlacksmith />);
    clickEnhance();
    expect(screen.getByTestId('enh-fx-ghost')).toBeDefined();

    act(() => { vi.advanceTimersByTime(ENHANCE_FX_DURATION_MS + 50); });
    expect(screen.queryByTestId('enh-fx-ghost')).toBeNull();
  });
});
