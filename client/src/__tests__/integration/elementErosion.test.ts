/**
 * 元素侵蝕（`07-affix.md` § 7.4）整合測試 —— 走完整條路徑：
 * 生成詞綴 → 裝備 → 命中 → 上 DoT → 結算扣血。
 *
 * 規則：
 *  - 詞綴的 % 是**觸發率**，每跳傷害在抽到當下由 `武器平均基傷的一半 ~ 滿值` 決定，之後固定
 *  - 觸發率與每跳傷害**都吃裝備品質**
 *  - 普攻與魔法命中都判定；雙持武器一次攻擊打兩下，判定兩次
 *  - DoT 每秒一跳、持續 5 秒、存續期間不可刷新、不吃怪物防禦
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  processPlayerAttack, EROSION_CATEGORY, EROSION_DURATION_MS, EROSION_TICK_MS,
} from '../../systems/arpgEventHandler';
import {
  generateAffixes, getErosion, getWeaponBaseDamage, rollErosionDamage, BRAND_ELEMENTS, type Affix,
} from '../../models/affix';
import { useGameStore } from '../../stores/gameStore';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { MapMonster } from '../../stores/mapMonsterStore';
import type { Skill } from '../../models/skill';
import { getSkillTemplate } from '../../models/skillTemplate';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 500_000;

function knight(): Character {
  return {
    name: 'Tester', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp: 300, maxHp: 300, mp: 200, maxMp: 200,
    baseAttributes: { STR: 20, AGI: 20, VIT: 15, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function target(): MonsterInstance {
  return {
    templateId: 12, name: '石像鬼', level: 22, currentHp: 99999, maxHp: 99999,
    attackMin: 15, attackMax: 22, defense: 60, exp: 200,
    race: 'demon', size: 'large', element: 'earth', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

/** 小怪 30／大怪 26 → 平均基傷 28 */
const SWORD_BASE = 28;

function weapon(type: string, affixes: Affix[], quality = 0): EquipmentInstance {
  return {
    templateId: 2, name: '測試武器', type, slot: 'rightHand', isTwoHanded: type !== 'sword',
    smallMonsterDamage: 30, largeMonsterDamage: 26, defense: 0, quality, enhancement: 0,
    affixes, ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

const erosion = (chance: number, dot: number): Affix =>
  ({ type: 'element_erosion', tier: 7, value: chance, element: 'fire', dotDamage: dot });

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

function normalAttack(gear: EquipmentInstance[], monster: MonsterInstance) {
  const gs = useGameStore.getState();
  return processPlayerAttack(
    { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: ['m1'] },
    {
      character: gs.character!, equippedGear: gear,
      activeEffects: useGameStore.getState().activeEffects, skills: [],
      monsterInstances: new Map([['m1', monster]]), mapMonsters,
    },
  );
}

function erosionEffects() {
  return useGameStore.getState().activeEffects.filter(e => e.category === EROSION_CATEGORY);
}

beforeEach(() => {
  useGameStore.setState({ character: knight(), skills: [], activeEffects: [], equippedGear: {} });
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('生成：抽到當下就把數字定死', () => {
  it('侵蝕的每跳傷害落在 武器平均基傷的一半 ~ 武器平均基傷', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const a = generateAffixes('weapon', 60, 4, false, { weaponBaseDamage: SWORD_BASE })
        .find(x => x.type === 'element_erosion');
      if (!a?.dotDamage) continue;
      expect(a.dotDamage).toBeGreaterThanOrEqual(SWORD_BASE / 2);
      expect(a.dotDamage).toBeLessThanOrEqual(SWORD_BASE);
      seen.add(a.dotDamage);
    }
    // 抽得到範圍內多個值，不是固定一個數
    expect(seen.size).toBeGreaterThan(5);
  });

  it('下緣是一半、上緣是滿值，且低基傷武器不會歸零', () => {
    for (const base of [1, 2, 5, 28, 40]) {
      const min = Math.max(1, Math.floor(base / 2));
      for (let i = 0; i < 300; i++) {
        const d = rollErosionDamage(base);
        expect(d).toBeGreaterThanOrEqual(min);
        expect(d).toBeLessThanOrEqual(base);
      }
    }
  });

  it('侵蝕自己抽一個元素，與刻印各自獨立', () => {
    let differed = false;
    for (let i = 0; i < 3000; i++) {
      const affixes = generateAffixes('weapon', 60, 4, false, { weaponBaseDamage: SWORD_BASE });
      const e = affixes.find(x => x.type === 'element_erosion');
      const b = affixes.find(x => x.type === 'element_brand');
      if (!e || !b) continue;
      expect(BRAND_ELEMENTS).toContain(e.element!);
      if (e.element !== b.element) differed = true;
    }
    expect(differed).toBe(true);
  });

  it('武器平均基傷取小怪與大怪的平均', () => {
    expect(getWeaponBaseDamage({ smallMonsterDamage: 30, largeMonsterDamage: 26 })).toBe(28);
    expect(getWeaponBaseDamage({ smallMonsterDamage: 0, largeMonsterDamage: 0 })).toBe(1);
  });

  it('觸發率與每跳傷害都吃品質', () => {
    const a = [erosion(20, 10)];
    expect(getErosion(a, 0)).toEqual({ chance: 20, damage: 10, element: 'fire' });
    expect(getErosion(a, 20)).toEqual({ chance: 24, damage: 12, element: 'fire' });
  });
});

describe('觸發：命中後依機率上 DoT', () => {
  it('必定觸發時上 DoT，數值與詞綴一致', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const gear = [weapon('sword', [erosion(20, 12)])];
    const r = normalAttack(gear, target());

    const fx = erosionEffects();
    expect(fx).toHaveLength(1);
    expect(fx[0].dot).toEqual({
      damage: 12, element: 'fire', interval: EROSION_TICK_MS, totalDuration: EROSION_DURATION_MS,
    });
    expect(fx[0].targetMonsterId).toBe('m1');
    expect(r.logs.some(l => l.text.includes('元素侵蝕觸發'))).toBe(true);
  });

  it('沒抽中就不上 DoT', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 50 > 20% 觸發率
    normalAttack([weapon('sword', [erosion(20, 12)])], target());
    expect(erosionEffects()).toHaveLength(0);
  });

  it('沒有侵蝕詞綴就永遠不會上 DoT', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    normalAttack([weapon('sword', [{ type: 'attack_power', tier: 7, value: 20 }])], target());
    expect(erosionEffects()).toHaveLength(0);
  });

  it('品質放大後的觸發率才是實際判定值', () => {
    // 品質 20% → 觸發率 10 → 12。擲出 11 在放大前不中、放大後中
    vi.spyOn(Math, 'random').mockReturnValue(0.11);
    normalAttack([weapon('sword', [erosion(10, 5)], 20)], target());
    expect(erosionEffects()).toHaveLength(1);
    expect(erosionEffects()[0].dot!.damage).toBe(6); // 5 × 1.2

    useGameStore.setState({ activeEffects: [] });
    normalAttack([weapon('sword', [erosion(10, 5)], 0)], target());
    expect(erosionEffects()).toHaveLength(0);
  });

  it('DoT 存續期間不重複施加（§ 24.3.2）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const gear = [weapon('sword', [erosion(20, 12)])];
    normalAttack(gear, target());
    const r2 = normalAttack(gear, target());
    expect(erosionEffects()).toHaveLength(1);
    expect(r2.logs.some(l => l.text.includes('元素侵蝕觸發'))).toBe(false);
  });
});

describe('雙持一次攻擊判定兩次', () => {
  /**
   * 用真實亂數統計，不靠特定擲骰序列 —— 攻擊本身也會消耗 Math.random，
   * 寫死序列只會測到「第幾次呼叫」而不是「判定幾次」。
   *
   * 觸發率 20% 時：單手 20%、雙持 1 − 0.8² = 36%。
   * 各跑 4000 次，用寬鬆區間避免偶發失敗。
   */
  function procRate(type: string, chance: number, runs = 4000): number {
    let hits = 0;
    for (let i = 0; i < runs; i++) {
      useGameStore.setState({ activeEffects: [] });
      normalAttack([weapon(type, [erosion(chance, 8)])], target());
      if (erosionEffects().length > 0) hits++;
    }
    return hits / runs;
  }

  it('單手 ≈ 觸發率，雙持 ≈ 1 −（1 − 觸發率）²', () => {
    const single = procRate('sword', 20);
    const dual = procRate('dualBlade', 20);
    expect(single).toBeGreaterThan(0.16);
    expect(single).toBeLessThan(0.24);
    expect(dual).toBeGreaterThan(0.31);
    expect(dual).toBeLessThan(0.41);
    expect(dual).toBeGreaterThan(single);
  });

  it('鋼爪與雙刀同樣判定兩次', () => {
    const claw = procRate('claw', 20, 2000);
    expect(claw).toBeGreaterThan(0.29);
    expect(claw).toBeLessThan(0.43);
  });
});

describe('魔法命中也會觸發', () => {
  it('魔法技能命中後同樣依觸發率上 DoT', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const skill = { ...getSkillTemplate('fireball')!, lastUsedAt: 0 } as Skill;
    const gear = [weapon('sword', [erosion(20, 12)])];
    useGameStore.setState({ skills: [skill] });
    const gs = useGameStore.getState();
    processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId: 'fireball' }, targetMonsterIds: ['m1'], skill },
      {
        character: gs.character!, equippedGear: gear,
        activeEffects: gs.activeEffects, skills: [skill],
        monsterInstances: new Map([['m1', target()]]), mapMonsters,
      },
    );
    expect(erosionEffects()).toHaveLength(1);
    expect(erosionEffects()[0].dot!.damage).toBe(12);
  });

  it('魔法只判定一次（不套雙持的兩次）', () => {
    let hits = 0;
    const skill = { ...getSkillTemplate('fireball')!, lastUsedAt: 0 } as Skill;
    useGameStore.setState({ skills: [skill] });
    for (let i = 0; i < 3000; i++) {
      useGameStore.setState({ activeEffects: [] });
      const gs = useGameStore.getState();
      processPlayerAttack(
        { type: 'player_attack', action: { type: 'skill', skillId: 'fireball' }, targetMonsterIds: ['m1'], skill },
        {
          character: gs.character!, equippedGear: [weapon('dualBlade', [erosion(20, 8)])],
          activeEffects: gs.activeEffects, skills: [skill],
          monsterInstances: new Map([['m1', target()]]), mapMonsters,
        },
      );
      if (erosionEffects().length > 0) hits++;
    }
    const rate = hits / 3000;
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.26); // 若誤套雙持兩次會落在 0.36 附近
  });
});

describe('DoT 的結算特性', () => {
  it('DoT 傷害不隨怪物防禦縮水（§ 24.4.5）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const gear = [weapon('sword', [erosion(20, 12)])];

    normalAttack(gear, { ...target(), defense: 0 });
    const noDef = erosionEffects()[0].dot!.damage;

    useGameStore.setState({ activeEffects: [] });
    normalAttack(gear, { ...target(), defense: 75 });
    const highDef = erosionEffects()[0].dot!.damage;

    expect(noDef).toBe(12);
    expect(highDef).toBe(12);
  });

  it('持續 5 秒、每秒一跳', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    normalAttack([weapon('sword', [erosion(20, 12)])], target());
    const fx = erosionEffects()[0];
    expect(fx.duration).toBe(5000);
    expect(fx.dot!.interval).toBe(1000);
    expect(fx.dot!.totalDuration / fx.dot!.interval).toBe(5);
  });
});
