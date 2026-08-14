import { describe, it, expect } from 'vitest';
import { MONSTER_SEEDS } from '../seed/monsterSeeds';
import { getExpToNextLevel } from '../../systems/levelUp';

/** `28-monster-stats.md` § 28.1 */
const baseExp = (level: number) => Math.round(2 * Math.pow(1.1302, level - 1));
/** `28-monster-stats.md` § 28.1 結算倍率（不含回鍋加倍） */
const KILL_EXP_MULTIPLIER = 3;

const normals = MONSTER_SEEDS.filter(m => !m.isBoss);
const bosses = MONSTER_SEEDS.filter(m => m.isBoss);

describe('怪物經驗曲線（`28-monster-stats.md` § 28.1）', () => {
  it('一般怪經驗完全由等級決定', () => {
    const offenders = normals.filter(m => m.exp !== baseExp(m.level));
    expect(offenders.map(m => `${m.name}(Lv${m.level})=${m.exp}`)).toEqual([]);
  });

  it('同級一般怪經驗一致', () => {
    const byLevel = new Map<number, Set<number>>();
    for (const m of normals) {
      const set = byLevel.get(m.level) ?? new Set<number>();
      set.add(m.exp);
      byLevel.set(m.level, set);
    }
    const split = [...byLevel.entries()].filter(([, set]) => set.size > 1);
    expect(split).toEqual([]);
  });

  it('怪物等級上限 60，經驗封頂 2,736', () => {
    expect(Math.max(...MONSTER_SEEDS.map(m => m.level))).toBe(60);
    expect(baseExp(60)).toBe(2736);
  });

  it('Boss 經驗倍率落在 x4.4~x6.4', () => {
    const mults = bosses.map(b => b.exp / baseExp(b.level));
    expect(Math.min(...mults)).toBeGreaterThanOrEqual(4.4);
    expect(Math.max(...mults)).toBeLessThanOrEqual(6.4);
  });
});

describe('升級節奏（`04-character.md` § 4.9 × § 28.1）', () => {
  const killsFor = (level: number) =>
    getExpToNextLevel(level) / (baseExp(level) * KILL_EXP_MULTIPLIER);

  it('每級所需擊殺數整體單調上升', () => {
    // Lv1~16 因整數化有最大 4 隻的回落（§ 28.1），只在該區間放行
    const dips: number[] = [];
    for (let level = 2; level <= 59; level++) {
      if (killsFor(level) < killsFor(level - 1)) dips.push(level);
    }
    expect(dips.every(level => level <= 16)).toBe(true);
    expect(Math.max(...dips.map(level => killsFor(level - 1) - killsFor(level)))).toBeLessThan(5);
  });

  it('Lv1→60 合計約 3,790 隻', () => {
    let total = 0;
    for (let level = 1; level <= 59; level++) total += killsFor(level);
    expect(total).toBeGreaterThan(3_600);
    expect(total).toBeLessThan(4_000);
  });

  it('卡等牆：Lv65 單級擊殺數為 Lv60 的 2.2 倍以上', () => {
    // Lv60 以上怪物經驗封頂，曲線倍率全額轉為擊殺數成長
    const capped = baseExp(60) * KILL_EXP_MULTIPLIER;
    const kills60 = getExpToNextLevel(60) / capped;
    const kills65 = getExpToNextLevel(65) / capped;
    expect(kills65 / kills60).toBeGreaterThan(2.2);
  });

  it('後段比前段重：Lv50→60 佔總擊殺數 3 成以上', () => {
    let total = 0;
    let late = 0;
    for (let level = 1; level <= 59; level++) {
      total += killsFor(level);
      if (level >= 50) late += killsFor(level);
    }
    expect(late / total).toBeGreaterThan(0.3);
    expect(late / total).toBeLessThan(0.45);
  });
});
