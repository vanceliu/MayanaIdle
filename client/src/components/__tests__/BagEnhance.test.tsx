import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { BagPanel } from '../BagPanel';
import { useGameStore } from '../../stores/gameStore';
import { bagItem, bagItemById } from '../../testing/bagFixtures';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { EquipmentInstance } from '../../models/equipment';
import {
  WEAPON_ENHANCE_SCROLL_ID, ARMOR_ENHANCE_SCROLL_ID, WEAPON_ENHANCE_MINUS_SCROLL_ID,
} from '../../systems/enhanceScroll';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 */

/**
 * 強化入口在背包（`35-inventory-constraints.md` § 35.5.5）：
 * 點卷軸兩下進入指定目標模式，再點裝備結算，過程與結果都進 log。
 */

function instanceOf(name: string, id: number, patch: Partial<EquipmentInstance> = {}): EquipmentInstance {
  const tpl = EQUIPMENT_SEEDS.find(t => t.name === name)!;
  return {
    id, templateId: tpl.id!, name: tpl.name, type: tpl.type, slot: tpl.slot,
    isTwoHanded: tpl.isTwoHanded, smallMonsterDamage: tpl.smallMonsterDamage,
    largeMonsterDamage: tpl.largeMonsterDamage, defense: tpl.defense,
    quality: 0, enhancement: 0, stability: tpl.stability, affixes: [],
    ownerId: 1, equipped: false, ...patch,
  } as never;
}

const sword = (patch?: Partial<EquipmentInstance>) => instanceOf('鋼心劍', 101, patch);
/** 皮腰帶：安定值 -1，不可強化 */
const belt = () => instanceOf('皮腰帶', 102);

/** 一次完整的滑鼠點擊：按下與放開落在同一點 */
function tap(el: Element) {
  fireEvent.pointerDown(el, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(el, { button: 0, clientX: 10, clientY: 10 });
}

/**
 * 格子名稱在畫面上被截成四個字（`BagGrid.getShortName`），三種卷軸看起來一樣，
 * 所以測試一律用版面順序定位：背包道具依 `bagItems` 順序，裝備接在後面依實例 id 排。
 */
function cellAt(index: number): HTMLElement {
  const cells = Array.from(document.querySelectorAll('.bag-cell')) as HTMLElement[];
  const hit = cells[index];
  if (!hit) throw new Error(`背包沒有第 ${index} 格`);
  return hit;
}

const logs = () => useGameStore.getState().combatLogs.map(l => l.text);
const lastLog = () => logs()[logs().length - 1] ?? '';
const inv = () => useGameStore.getState().inventory;
const bagAmount = (id: number) => useGameStore.getState().bagItems.find(b => b.itemId === id)?.amount ?? 0;

function setup(items: EquipmentInstance[], bag = [bagItemById(WEAPON_ENHANCE_SCROLL_ID, 3)]) {
  useGameStore.setState({
    character: { name: 'T', className: 'knight', level: 30, gold: 0, id: 1, userId: 1 } as never,
    equippedGear: {},
    inventory: items,
    bagItems: bag,
    bagSlotMap: {},
    combatLogs: [],
  });
}

describe('背包強化（§ 35.5.5）', () => {
  beforeEach(() => {
    setup([sword()]);
  });

  it('點卷軸兩下進入指定目標模式並提示', () => {
    render(<BagPanel />);
    const scroll = cellAt(0);
    tap(scroll);
    tap(scroll);

    expect(lastLog()).toContain('請選擇要強化的武器');
    expect(inv()[0].enhancement).toBe(0);
  });

  it('指定目標後結算，結果進 log 並消耗卷軸', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<BagPanel />);
    const scroll = cellAt(0);
    tap(scroll);
    tap(scroll);
    fireEvent.pointerDown(cellAt(1), { button: 0, clientX: 10, clientY: 10 });

    expect(inv()[0].enhancement).toBe(1);
    expect(bagAmount(WEAPON_ENHANCE_SCROLL_ID)).toBe(2);
    expect(lastLog()).toContain('強化成功');
    vi.restoreAllMocks();
  });

  it('失敗時裝備消失，log 說明損毀', () => {
    setup([sword({ enhancement: 6 })]);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    render(<BagPanel />);
    const scroll = cellAt(0);
    tap(scroll);
    tap(scroll);
    fireEvent.pointerDown(cellAt(1), { button: 0, clientX: 10, clientY: 10 });

    expect(inv()).toHaveLength(0);
    expect(lastLog()).toContain('已損毀');
    vi.restoreAllMocks();
  });

  it('點不合法的目標＝取消，不消耗卷軸', () => {
    setup([belt()], [bagItemById(ARMOR_ENHANCE_SCROLL_ID, 2)]);
    render(<BagPanel />);
    const scroll = cellAt(0);
    tap(scroll);
    tap(scroll);
    fireEvent.pointerDown(cellAt(1), { button: 0, clientX: 10, clientY: 10 });

    expect(bagAmount(ARMOR_ENHANCE_SCROLL_ID)).toBe(2);
    expect(lastLog()).toContain('不是要強化的防具');
  });

  it('模式中點藥水不會喝掉，只是取消', () => {
    // 基礎藥水排在所有背包道具之前，所以藥水在第 0 格、卷軸在第 1 格
    setup([sword()], [bagItemById(WEAPON_ENHANCE_SCROLL_ID, 3), bagItem('紅色藥水', 5)]);
    render(<BagPanel />);
    const scroll = cellAt(1);
    tap(scroll);
    tap(scroll);
    fireEvent.pointerDown(cellAt(0), { button: 0, clientX: 10, clientY: 10 });

    expect(bagAmount(WEAPON_ENHANCE_SCROLL_ID)).toBe(3);
    expect(useGameStore.getState().bagItems.find(b => b.name === '紅色藥水')?.amount).toBe(5);
    expect(lastLog()).toContain('已取消');
  });

  it('卷軸 tooltip 給出兩段式點擊的提示（§ 35.5.4）', () => {
    render(<BagPanel />);
    const scroll = cellAt(0);
    fireEvent.mouseEnter(scroll);
    expect(screen.getByText('點擊選取')).toBeDefined();

    tap(scroll);
    fireEvent.mouseEnter(scroll);
    expect(screen.getByText('再點一次選擇強化目標')).toBeDefined();
  });

  it('Esc 退出指定目標模式', () => {
    render(<BagPanel />);
    const scroll = cellAt(0);
    tap(scroll);
    tap(scroll);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(lastLog()).toContain('已取消');
  });

  it('－卷軸提示的是降級，不是強化', () => {
    setup([sword({ enhancement: 3 })], [bagItemById(WEAPON_ENHANCE_MINUS_SCROLL_ID, 1)]);
    render(<BagPanel />);
    const scroll = cellAt(0);
    tap(scroll);
    tap(scroll);

    expect(lastLog()).toContain('請選擇要降級的武器');
  });

  it('合法目標亮框、其餘壓暗', () => {
    setup([sword(), belt()], [bagItemById(WEAPON_ENHANCE_SCROLL_ID, 1)]);
    render(<BagPanel />);
    const scroll = cellAt(0);
    tap(scroll);
    tap(scroll);

    expect(cellAt(1).className).toContain('enh-target');
    expect(cellAt(2).className).toContain('enh-target-off');
  });
});

describe('背包機率視窗（§ 35.5.5）', () => {
  beforeEach(() => {
    setup([sword({ enhancement: 6 })]);
  });

  it('機率模式一樣標出可指定的裝備', () => {
    render(<BagPanel />);
    fireEvent.click(screen.getByRole('button', { name: '機率' }));

    expect(cellAt(1).className).toContain('enh-target');
  });

  it('點「機率」再點裝備會開視窗，列出三種卷軸', () => {
    render(<BagPanel />);
    fireEvent.click(screen.getByRole('button', { name: '機率' }));
    fireEvent.pointerDown(cellAt(1), { button: 0, clientX: 10, clientY: 10 });

    expect(screen.getByText('強化機率')).toBeDefined();
    expect(screen.getByText('武器卷')).toBeDefined();
    expect(screen.getByText('武器卷＋')).toBeDefined();
    expect(screen.getByText('武器卷－')).toBeDefined();
    // +6 使用時判 +7 那一格：超出安定值 6，成功率 1/3
    expect(screen.getAllByText('33%').length).toBe(2);
  });

  it('不可強化的裝備直說不可強化', () => {
    setup([belt()]);
    render(<BagPanel />);
    fireEvent.click(screen.getByRole('button', { name: '機率' }));
    fireEvent.pointerDown(cellAt(1), { button: 0, clientX: 10, clientY: 10 });

    expect(screen.getByText('不可強化')).toBeDefined();
  });
});
