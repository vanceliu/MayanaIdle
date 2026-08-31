import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { BagPanel } from '../BagPanel';
import { FX_DURATION_MS } from '../town/useOneShotFx';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { useGameStore } from '../../stores/gameStore';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { db } from '../../db/database';
import { loadTemplateCache } from '../../systems/templateSync';
import { bagItemById } from '../../testing/bagFixtures';
import { WEAPON_ENHANCE_SCROLL_ID } from '../../systems/enhanceScroll';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 */

/**
 * 強化演出（`48-vfx.md` § 48.4），入口在背包（`35-inventory-constraints.md` § 35.5.5）。
 *
 * 這裡驗的是「演出不影響判定」與「三段各自掛對 class」，
 * 成功率與安定值本身由 `enhanceScroll` 的單元測試負責，不在這裡重測。
 */

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
    character: { name: 'FxHero', className: 'knight', level: 30, gold: 0, id: 1, userId: 1 } as never,
    equippedGear: {},
    inventory: [sword(enhancement)],
    bagItems: [bagItemById(WEAPON_ENHANCE_SCROLL_ID, 5)],
    bagSlotMap: {},
    combatLogs: [],
  });
}

/** 卷軸在第 0 格、裝備在第 1 格（背包道具排在裝備之前） */
function cellAt(index: number): HTMLElement {
  return (document.querySelectorAll('.bag-cell')[index]) as HTMLElement;
}

function tap(el: Element) {
  fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(el, { button: 0, clientX: 10, clientY: 10 });
}

/**
 * 點卷軸進入指定目標模式，再點裝備結算。
 * 未選取時要兩下（選取→執行），已選取的格子一下就進得去（§ 35.1.4）。
 */
function enhanceSword() {
  const scroll = cellAt(0);
  const before = useGameStore.getState().combatLogs.length;
  tap(scroll);
  // 未選取時要兩下（選取→執行），已選取的格子一下就進得去（§ 35.1.4）
  if (useGameStore.getState().combatLogs.length === before) tap(scroll);
  fireEvent.pointerDown(cellAt(1), { button: 0, clientX: 10, clientY: 10 });
}

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

  it('安定值內成功只給白閃，沒有金色與光環', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    setup(3);
    const { container } = render(<BagPanel />);
    enhanceSword();

    expect(container.querySelector('.enh-flash-soft')).not.toBeNull();
    expect(container.querySelector('.enh-flash-gold')).toBeNull();
    expect(container.querySelector('.enh-ring')).toBeNull();
    expect(screen.getByText('+4')).toBeDefined();
  });

  it('超過安定值成功：白閃 + 金色 + 兩圈光環 + +N', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    setup(6);
    const { container } = render(<BagPanel />);
    enhanceSword();

    expect(container.querySelector('.enh-flash-soft')).not.toBeNull();
    expect(container.querySelector('.enh-flash-gold')).not.toBeNull();
    expect(container.querySelectorAll('.enh-ring')).toHaveLength(2);
    expect(screen.getByText('+7')).toBeDefined();
  });

  it('失敗：裝備立刻從背包移除，碎裂由殘影演完', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setup(6);
    const { container } = render(<BagPanel />);
    enhanceSword();

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

  /**
   * 連點：React 沿用同一個 DOM 節點時 CSS 動畫不會重跑，第二次強化等於沒有演出。
   * 覆蓋層以 token 當 key 強制重新掛載。
   */
  it('連續強化時演出會重播，不是沿用同一個節點', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    setup(3);
    render(<BagPanel />);
    enhanceSword();
    const first = screen.getByTestId('enh-fx-success');

    // 不等演出結束就再強化一次
    enhanceSword();
    const second = screen.getByTestId('enh-fx-success');
    expect(second).not.toBe(first);
  });

  it('演出結束後殘影收掉，不留在畫面上', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setup(6);
    render(<BagPanel />);
    enhanceSword();
    expect(screen.getByTestId('enh-fx-ghost')).toBeDefined();

    act(() => { vi.advanceTimersByTime(FX_DURATION_MS + 50); });
    expect(screen.queryByTestId('enh-fx-ghost')).toBeNull();
  });
});
