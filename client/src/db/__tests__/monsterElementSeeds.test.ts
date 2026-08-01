import { describe, it, expect } from 'vitest';
import { MONSTER_SEEDS } from '../seed/monsterSeeds';
import type { ElementType } from '../../models/monster';

/**
 * 驗證 seed 的元素資料符合
 * docs/design/25-monster-system.md § 25.6 / § 25.8 與 docs/design/42-element-system.md § 42.1
 *
 * 分布守門的目的：42-element-system.md § 42.2 的環狀克制（火→風→地→冰→火）
 * 只有在各元素都有足夠怪物時才有意義。單一元素過度集中會讓克制退化成
 * 「光克暗」一條路徑，其餘屬性附魔失去價值。
 */

/** § 42.1 元素類型 */
const ELEMENT_TYPES: ElementType[] = ['fire', 'ice', 'wind', 'earth', 'light', 'dark', 'none'];

/** 高階段定義：Lv46 以上，即龍谷地間後段／遠古地監／百柱塔主體 */
const ENDGAME_MIN_LEVEL = 46;

/** 單一元素全域佔比上限（暗屬性重配後為 28%） */
const MAX_ELEMENT_SHARE = 0.30;

/** 高階段每種元素的最低隻數，確保環狀克制在終局仍可用 */
const MIN_ENDGAME_COUNT_PER_ELEMENT = 3;

function countByElement(monsters: typeof MONSTER_SEEDS): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of ELEMENT_TYPES) counts[e] = 0;
  for (const m of monsters) counts[m.element]++;
  return counts;
}

describe('怪物元素 seed 資料', () => {
  it('所有元素皆為 § 42.1 定義的類型', () => {
    for (const m of MONSTER_SEEDS) {
      expect(ELEMENT_TYPES, m.name).toContain(m.element);
    }
  });

  it('§ 25.6 同名怪物跨區域元素一致（不為同一怪物設計多個獨立模板）', () => {
    const byName = new Map<string, ElementType>();
    for (const m of MONSTER_SEEDS) {
      const existing = byName.get(m.name);
      if (existing === undefined) byName.set(m.name, m.element);
      else expect(m.element, m.name).toBe(existing);
    }
  });

  it('每種元素在全域皆有怪物分布', () => {
    const counts = countByElement(MONSTER_SEEDS);
    for (const e of ELEMENT_TYPES) {
      expect(counts[e], e).toBeGreaterThan(0);
    }
  });

  it(`單一元素全域佔比不超過 ${MAX_ELEMENT_SHARE * 100}%`, () => {
    const counts = countByElement(MONSTER_SEEDS);
    const total = MONSTER_SEEDS.length;
    for (const e of ELEMENT_TYPES) {
      expect(counts[e] / total, `${e} = ${counts[e]}/${total}`).toBeLessThanOrEqual(MAX_ELEMENT_SHARE);
    }
  });

  it(`高階段（Lv${ENDGAME_MIN_LEVEL}+）每種元素至少 ${MIN_ENDGAME_COUNT_PER_ELEMENT} 隻，環狀克制仍可用`, () => {
    const endgame = MONSTER_SEEDS.filter(m => m.level >= ENDGAME_MIN_LEVEL);
    const counts = countByElement(endgame);
    for (const e of ELEMENT_TYPES) {
      expect(counts[e], `${e} @ Lv${ENDGAME_MIN_LEVEL}+`).toBeGreaterThanOrEqual(MIN_ENDGAME_COUNT_PER_ELEMENT);
    }
  });
});
