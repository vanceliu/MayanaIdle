import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TownBlacksmith } from '../town/TownBlacksmith';
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
 * 上位強化卷軸（`06-equipment.md` § 6.12）：
 * 級數隨機 +1~3 均等，成功率只看**使用前的等級**（＝普通卷軸這次要判的那一格），
 * 抽到幾級只決定跳多遠。
 */

const WEAPON_SCROLL_ID = 7;
const WEAPON_PLUS_SCROLL_ID = 157;
const ARMOR_PLUS_SCROLL_ID = 158;

/** 鋼心劍：安定值 6 */
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

function setup(enhancement: number, plusScrolls = 5) {
  useGameStore.setState({
    character: {
      name: 'PlusHero', className: 'knight', level: 30, exp: 0, expToNext: 5000,
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
    bagItems: [bagItemById(WEAPON_SCROLL_ID, 5), bagItemById(WEAPON_PLUS_SCROLL_ID, plusScrolls)],
    craftQuests: [],
  });
}

const plusButton = () => screen.getByTestId('enh-btn-plus') as HTMLButtonElement;
const enhancement = () => useGameStore.getState().inventory[0]?.enhancement;
const bagAmount = (id: number) =>
  useGameStore.getState().bagItems.find(b => b.itemId === id)?.amount ?? 0;

describe('上位強化卷軸（§ 6.12）', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    resetSeedState();
    await seedDatabase();
    await loadTemplateCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('級數隨機 +1~3，抽到 3 就一次跳三級', () => {
    setup(0);
    // 第一顆 random 決定級數（0.9 → +3），第二顆是成功率判定
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0);
    render(<TownBlacksmith />);
    fireEvent.click(plusButton());

    expect(enhancement()).toBe(3);
  });

  it('抽到 1 時只 +1', () => {
    setup(0);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
    render(<TownBlacksmith />);
    fireEvent.click(plusButton());

    expect(enhancement()).toBe(1);
  });

  it('安定值內必定成功 —— 判定的骰子再差也不會壞', () => {
    setup(3);
    // +3 抽到 +3 → 目標 +6，安定值 6 之內
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0.999);
    render(<TownBlacksmith />);
    fireEvent.click(plusButton());

    expect(enhancement()).toBe(6);
  });

  it('+5 抽到 +3 一樣必成 —— 判的是 +6 那一格，不是 +8', () => {
    setup(5);
    // 第二顆骰再差也不影響：安定值 6 之內必定成功
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0.999);
    render(<TownBlacksmith />);
    fireEvent.click(plusButton());

    expect(enhancement()).toBe(8);
  });

  it('+6 使用時判 +7 那一格：成功率 1/3，成功就依抽到的級數跳', () => {
    setup(6);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0.32);
    render(<TownBlacksmith />);
    fireEvent.click(plusButton());

    expect(enhancement()).toBe(9);
  });

  it('+6 使用且判定失敗時裝備消失', () => {
    setup(6);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    render(<TownBlacksmith />);
    fireEvent.click(plusButton());

    expect(useGameStore.getState().inventory).toHaveLength(0);
    expect(screen.getByText(/已損毀/)).toBeTruthy();
  });

  it('只消耗上位卷軸，不動普通卷軸', () => {
    setup(0);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);
    render(<TownBlacksmith />);
    fireEvent.click(plusButton());

    expect(bagAmount(WEAPON_PLUS_SCROLL_ID)).toBe(4);
    expect(bagAmount(WEAPON_SCROLL_ID)).toBe(5);
  });

  it('沒有上位卷軸時按鈕停用', () => {
    setup(0, 0);
    render(<TownBlacksmith />);

    expect(plusButton().disabled).toBe(true);
  });

  it('武器不吃防具的上位卷軸', () => {
    setup(0, 0);
    useGameStore.setState({
      bagItems: [bagItemById(WEAPON_SCROLL_ID, 5), bagItemById(ARMOR_PLUS_SCROLL_ID, 9)],
    });
    render(<TownBlacksmith />);

    expect(plusButton().disabled).toBe(true);
  });
});

/** 下位卷軸：-1、必定成功（`06-equipment.md` § 6.12） */
describe('下位強化卷軸（§ 6.12）', () => {
  const WEAPON_MINUS_SCROLL_ID = 159;
  const minusButton = () => screen.getByTestId('enh-btn-minus') as HTMLButtonElement;

  function setupMinus(enhancement: number, minusScrolls = 3) {
    setup(enhancement, 0);
    useGameStore.setState({
      bagItems: [bagItemById(WEAPON_MINUS_SCROLL_ID, minusScrolls)],
    });
  }

  beforeEach(async () => {
    await db.delete();
    await db.open();
    resetSeedState();
    await seedDatabase();
    await loadTemplateCache();
  });

  it('降一級，必定成功，骰子再差也不會壞', () => {
    setupMinus(8);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    render(<TownBlacksmith />);
    fireEvent.click(minusButton());

    expect(enhancement()).toBe(7);
    expect(useGameStore.getState().inventory).toHaveLength(1);
  });

  it('消耗一張下位卷軸', () => {
    setupMinus(4);
    render(<TownBlacksmith />);
    fireEvent.click(minusButton());

    expect(bagAmount(WEAPON_MINUS_SCROLL_ID)).toBe(2);
  });

  it('+0 時停用', () => {
    setupMinus(0);
    render(<TownBlacksmith />);

    expect(minusButton().disabled).toBe(true);
  });

  it('沒有下位卷軸時停用', () => {
    setupMinus(5, 0);
    render(<TownBlacksmith />);

    expect(minusButton().disabled).toBe(true);
  });

  it('不計入強化次數與損毀數', () => {
    setupMinus(5);
    const before = { ...useGameStore.getState().statistics };
    render(<TownBlacksmith />);
    fireEvent.click(minusButton());

    const stats = useGameStore.getState().statistics;
    expect(stats.weaponEnhanceAttempts).toBe(before.weaponEnhanceAttempts);
    expect(stats.weaponsBroken).toBe(before.weaponsBroken);
  });
});
