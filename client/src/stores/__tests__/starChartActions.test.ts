import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDb } from '../../testing/testDb';
import { useGameStore, getEffectiveMaxHp, processMonsterDeath } from '../gameStore';
import type { MonsterInstance } from '../../models/monster';
import { ACTION_ALLOWLIST } from '../../net/protocol';
import { starRefundCostPerPoint } from '../../models/starChart';
import type { Character } from '../../models/character';

/**
 * 星盤套用整份配點（`56-star-chart.md` § 56.7）。
 * 判定在 store；線上模式經 RPC 白名單轉給 server 執行。
 */
function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 1, userId: 1, name: '測試', className: 'knight', level: 40,
    exp: 0, expToNext: 100, hp: 1, mp: 1,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    starChart: ['knight-start'], gold: 1_000_000,
    currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
    ...overrides,
  };
}

function setup(char: Partial<Character> = {}) {
  useGameStore.setState({
    character: character(char), equippedGear: {}, inventory: [], bagItems: [], skills: [], activeEffects: [], combatLogs: [],
  } as never);
}
const chart = () => useGameStore.getState().character!.starChart;
const gold = () => useGameStore.getState().character!.gold;

beforeEach(() => {
  resetTestDb();
  localStorage.clear();
});

describe('星盤動作', () => {
  const apply = (ids: unknown) => useGameStore.getState().applyStarChart(ids as string[]);

  it('套用動作在 RPC 白名單', () => {
    expect(ACTION_ALLOWLIST.game.has('applyStarChart')).toBe(true);
  });

  it('只新增：直接套用，不扣錢', () => {
    setup();
    expect(apply(['knight-start', 'knight-r360', 'knight-r300'])).toBe(true);
    expect(chart()).toEqual(['knight-start', 'knight-r360', 'knight-r300']);
    expect(gold()).toBe(1_000_000);
  });

  it('不合法的整份配點不套：斷開、缺起點、超出點數、型別錯誤', () => {
    setup({ level: 31 });
    for (const bad of [
      ['knight-start', 'knight-r300'],
      ['knight-r360'],
      ['knight-start', 'knight-r360', 'knight-r300'],
      'knight-start', [1, 2], null, ['__proto__'],
    ]) expect(apply(bad), JSON.stringify(bad)).toBe(false);
    expect(chart()).toEqual(['knight-start']);
  });

  it('退回已點節點：扣 退回點數 × 等級 × 1000；同時新增的不算', () => {
    setup({ starChart: ['knight-start', 'knight-r360', 'knight-r300'] });
    expect(apply(['knight-start', 'knight-side0-1'])).toBe(true);
    expect(chart()).toEqual(['knight-start', 'knight-side0-1']);
    expect(gold()).toBe(1_000_000 - 2 * starRefundCostPerPoint(40));
  });

  it('金幣不足不套', () => {
    setup({ starChart: ['knight-start', 'knight-r360'], gold: starRefundCostPerPoint(40) - 1 });
    expect(apply(['knight-start'])).toBe(false);
    expect(chart()).toEqual(['knight-start', 'knight-r360']);
  });

  it('退掉加 HP 的節點後，HP 夾在新的上限內', () => {
    setup({ starChart: ['knight-start', 'knight-r360', 'knight-r300'] });
    const s = useGameStore.getState();
    useGameStore.setState({ character: { ...s.character!, hp: getEffectiveMaxHp(s.character!, {}, []) } });
    apply(['knight-start', 'knight-r360']);
    const after = useGameStore.getState().character!;
    expect(after.hp).toBe(getEffectiveMaxHp(after, {}, []));
  });

  it('升到 Lv30 時起點自動點上（§ 56.1）', () => {
    setup({ level: 29, exp: 0, expToNext: 1, starChart: [] });
    const monster = {
      templateId: 1, name: '史萊姆', level: 29, currentHp: 0, maxHp: 10, attackMin: 1, attackMax: 1, defense: 0, exp: 10,
      race: 'normal', size: 'small', element: 'none', isBoss: false, attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    } as MonsterInstance;
    const char = useGameStore.getState().character!;
    const result = processMonsterDeath(() => useGameStore.getState(), s => useGameStore.setState(s), [monster], 0, char, [], [], undefined, { withDrops: false });
    expect(result.char.level).toBe(30);
    expect(result.char.starChart).toEqual(['knight-start']);
  });
});
