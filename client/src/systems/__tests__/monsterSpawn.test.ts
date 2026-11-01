import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMonsterFromTemplate, createTrainingDummy } from '../monsterSpawn';
import { DUMMY_INFINITE_HP } from '../../models/trainingGround';
import type { MonsterTemplate } from '../../models/monster';
import type { MapMonster } from '../../stores/mapMonsterStore';

const mapMonster = (over: Partial<MapMonster> = {}): MapMonster =>
  ({ id: 'm1', isBoss: false, position: { x: 0, y: 0 }, ...over } as MapMonster);

const template = (over: Partial<MonsterTemplate> = {}): MonsterTemplate => ({
  id: 1, name: '灰狼', area: 'dawn', level: 5, hp: 120,
  attackMin: 8, attackMax: 12, defense: 3, exp: 40,
  race: 'beast', size: 'small', element: 'none', isBoss: false, ...over,
} as MonsterTemplate);

/** 預設亂數落在強化詞綴區段之外（25 § 25.12.1），素質斷言才固定 */
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.99);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockRolls(...values: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[Math.min(i++, values.length - 1)]);
}

/**
 * 回村再回地圖時，第一批怪會在模板從 IndexedDB 讀回來之前就要求實例。
 * 舊版在那個空窗回一隻寫死的「怪物」，玩家看到假名字與假血量。
 */
describe('模板未載入時不生假怪', () => {
  it('模板清單為空 → 回 null', () => {
    expect(createMonsterFromTemplate(mapMonster(), [])).toBeNull();
    expect(createMonsterFromTemplate(mapMonster({ isBoss: true }), [])).toBeNull();
  });

  it('模板載入後照模板建，名字與血量都來自模板', () => {
    const inst = createMonsterFromTemplate(mapMonster(), [template()]);
    expect(inst).not.toBeNull();
    expect(inst!.name).toBe('灰狼');
    expect(inst!.maxHp).toBe(120);
    expect(inst!.currentHp).toBe(120);
    expect(inst!.level).toBe(5);
  });

  it('Boss 與一般怪各自從對應的池抽', () => {
    const pool = [template(), template({ id: 2, name: '狼王', isBoss: true, hp: 900 })];
    expect(createMonsterFromTemplate(mapMonster({ isBoss: true }), pool)!.name).toBe('狼王');
    expect(createMonsterFromTemplate(mapMonster(), pool)!.name).toBe('灰狼');
  });

  it('試驗場木樁不吃模板，空清單照樣建得出來', () => {
    const dummy = createMonsterFromTemplate(
      mapMonster({ dummy: { level: 60, defense: 44, size: 'large', element: 'none' } as never }),
      [],
    );
    expect(dummy).not.toBeNull();
    expect(dummy!.name).toBe('木樁');
    expect(dummy!.isTrainingDummy).toBe(true);
  });

  it('木樁未指定 HP 時視為無限', () => {
    const d = createTrainingDummy({ level: 60, defense: 44, size: 'large', element: 'none' } as never);
    expect(d.maxHp).toBe(DUMMY_INFINITE_HP);
  });
});

describe('全域怪物血量與攻擊力倍率（28 § 28.1）', () => {
  it('倍率 1.0 時素質等於模板', () => {
    const inst = createMonsterFromTemplate(mapMonster(), [template()], { hp: 1, attack: 1 })!;
    expect(inst.maxHp).toBe(120);
    expect(inst.currentHp).toBe(120);
    expect(inst.attackMin).toBe(8);
    expect(inst.attackMax).toBe(12);
  });

  it('血量倍率只動 HP，攻擊力倍率只動攻擊區間', () => {
    const inst = createMonsterFromTemplate(mapMonster(), [template()], { hp: 2, attack: 1.5 })!;
    expect(inst.maxHp).toBe(240);
    expect(inst.currentHp).toBe(240);
    expect(inst.attackMin).toBe(12);
    expect(inst.attackMax).toBe(18);
    expect(inst.defense).toBe(3);
    expect(inst.exp).toBe(40);
  });

  it('Boss 同樣套用', () => {
    const inst = createMonsterFromTemplate(
      mapMonster({ isBoss: true }),
      [template({ isBoss: true, hp: 1000, attackMin: 20, attackMax: 30 })],
      { hp: 0.5, attack: 2 },
    )!;
    expect(inst.maxHp).toBe(500);
    expect(inst.attackMin).toBe(40);
    expect(inst.attackMax).toBe(60);
  });

  it('木樁不套用', () => {
    const inst = createMonsterFromTemplate(
      mapMonster({ dummy: { hp: 100, defense: 0, level: 1, size: 'small', element: 'none' } as any }),
      [template()],
      { hp: 5, attack: 5 },
    )!;
    expect(inst.maxHp).toBe(100);
    expect(inst.attackMax).toBe(0);
  });
});

describe('強化詞綴（25 § 25.12）', () => {
  it('擲中 1 詞綴：屬性加成作用在全域倍率之後', () => {
    // 模板 → 詞綴數 r=0.01（1 個）→ 詞綴池 index 4（巨大）
    mockRolls(0, 0.01, 0.4);
    const inst = createMonsterFromTemplate(mapMonster(), [template()], { hp: 2, attack: 1 })!;
    expect(inst.affixes).toEqual(['giant']);
    expect(inst.maxHp).toBe(288);
    expect(inst.currentHp).toBe(288);
  });

  it('沒擲中時沒有詞綴，素質不變', () => {
    const inst = createMonsterFromTemplate(mapMonster(), [template()])!;
    expect(inst.affixes).toBeUndefined();
    expect(inst.maxHp).toBe(120);
  });

  it('木樁不擲詞綴', () => {
    mockRolls(0);
    const inst = createMonsterFromTemplate(
      mapMonster({ dummy: { hp: 100, defense: 0, level: 60, size: 'small', element: 'none' } as never }),
      [],
    )!;
    expect(inst.affixes).toBeUndefined();
  });
});
