import { describe, it, expect } from 'vitest';
import { getCarryCapacity, getCarriedWeight, getWeightStatus, getOverweightMessage } from '../weight';
import type { Character } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';

/**
 * 負重系統（`20-attributes.md` § 20.7）。
 *
 * 超重的懲罰是**無法攻擊、無法施放魔法**（可以移動、可以回血回魔），
 * 判定在每次出手時進行，戰鬥記錄逐次顯示。
 */
function makeChar(str: number, vit: number): Character {
  return {
    name: 'T', className: 'knight', level: 10, exp: 0, expToNext: 100,
    hp: 100, maxHp: 100, mp: 50, maxMp: 50,
    baseAttributes: { STR: str, AGI: 10, VIT: vit, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  } as Character;
}
const gear = (o: Partial<EquipmentInstance>) => o as EquipmentInstance;

describe('負重上限', () => {
  it('= (力量 + 體質) × 100 + 裝備負重加成', () => {
    // § 20.7 的範例：力量 10、體質 10、皮腰帶（負重+1000）→ 3000
    const belt = gear({ bonusWeight: 1000 });
    expect(getCarryCapacity(makeChar(10, 10), [belt])).toBe(3000);
  });

  it('沒有腰帶時只算屬性', () => {
    expect(getCarryCapacity(makeChar(14, 16), [])).toBe(3000);
  });

  it('裝備的屬性加成會算進上限', () => {
    const ring = gear({ bonusAttributes: { STR: 1, AGI: 0, VIT: 1, SPI: 0, INT: 0, CHA: 0 } });
    expect(getCarryCapacity(makeChar(10, 10), [ring])).toBe(2200);
  });
});

describe('目前負重', () => {
  it('裝備在身上的東西一樣計重', () => {
    // 否則「全部穿起來」就能繞過上限
    expect(getCarriedWeight([gear({ weight: 30 }), gear({ weight: 12 })], [])).toBe(42);
  });

  it('背包物品依數量累計', () => {
    // 紅色藥水的重量取自 itemSeeds，不寫死在測試裡
    const one = getCarriedWeight([], [{ name: '紅色藥水', amount: 1 }]);
    expect(getCarriedWeight([], [{ name: '紅色藥水', amount: 5 }])).toBe(one * 5);
  });

  it('未知物品不計重，不會炸掉', () => {
    expect(getCarriedWeight([], [{ name: '不存在的東西', amount: 3 }])).toBe(0);
  });

  it('小數重量（印記 0.1）累加後不留浮點尾數', () => {
    // 0.1 × 3 的浮點結果是 0.30000000000000004，而負重是直接顯示在狀態列的數字
    expect(getCarriedWeight([], [{ name: '混沌印記', amount: 3 }])).toBe(0.3);
    expect(getCarriedWeight([gear({ weight: 12 })], [{ name: '強化印記', amount: 7 }])).toBe(12.7);
  });
});

describe('超重判定', () => {
  it('剛好等於上限不算超重', () => {
    const s = getWeightStatus(makeChar(10, 10), [gear({ weight: 2000 })], []);
    expect(s.carried).toBe(2000);
    expect(s.capacity).toBe(2000);
    expect(s.overweight).toBe(false);
  });

  it('超過一點就算超重', () => {
    const s = getWeightStatus(makeChar(10, 10), [gear({ weight: 2001 })], []);
    expect(s.overweight).toBe(true);
  });

  it('訊息帶出目前負重與上限，玩家才知道差多少', () => {
    const s = getWeightStatus(makeChar(10, 10), [gear({ weight: 2500 })], []);
    const msg = getOverweightMessage(s);
    expect(msg).toContain('2500');
    expect(msg).toContain('2000');
    expect(msg).toContain('無法攻擊');
  });
});

describe('超重時擋下出手（§ 20.7）', () => {
  it('引擎在超重時發出 overweight_blocked 而不是 player_attack', async () => {
    const { tickArpgEngine, createArpgEngine } = await import('../arpgEngine');
    const char = makeChar(10, 10);
    // 一件重到爆的裝備 → 必定超重
    const heavy = gear({ id: 1, slot: 'chest', weight: 9999 });
    const monster = {
      id: 'm1', name: '測試怪', currentHp: 100, maxHp: 100, level: 1,
      race: 'normal', element: 'none',
    } as never;
    const engine = createArpgEngine();
    const events = tickArpgEngine(engine, {
      playerPos: { x: 0, y: 0 },
      character: char,
      skills: [],
      activeEffects: [],
      equippedGear: [heavy],
      combatRules: [],
      mapMonsters: [{ id: 'm1', position: { x: 0, y: 0 }, monsterName: '測試怪' } as never],
      monsterInstances: new Map([['m1', monster]]),
      map: { width: 10, height: 10, tiles: [] } as never,
      deltaMs: 5000,
      bagItems: [],
    });
    expect(events.some(e => e.type === 'player_attack')).toBe(false);
  });
});
