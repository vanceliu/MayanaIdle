import { describe, it, expect } from 'vitest';
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
