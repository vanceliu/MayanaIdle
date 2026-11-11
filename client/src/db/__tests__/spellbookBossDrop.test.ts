import { describe, it, expect } from 'vitest';
import { BOSS_DROP_TABLE_SEEDS } from '../seed/dropSeeds';
import { getItemById } from '../../models/items';
import { getDropRate } from '../../wiki/hooks/useWikiData';

const SPELLBOOK_IDS = [97, 98, 99, 100, 101];

describe('象牙塔惡魔掉落魔法書（`27-drop-table.md` § 27.6）', () => {
  const spellbookDrops = BOSS_DROP_TABLE_SEEDS.filter(
    d => d.itemType === 'item' && d.itemTemplateId !== undefined && SPELLBOOK_IDS.includes(d.itemTemplateId),
  );

  it('5 本魔法書各一筆，只掛在象牙塔惡魔', () => {
    expect(spellbookDrops.map(d => d.itemTemplateId).sort((a, b) => a! - b!)).toEqual(SPELLBOOK_IDS);
    expect(spellbookDrops.every(d => d.bossName === '象牙塔惡魔')).toBe(true);
  });

  it('每本掉落值 0.1（0.01%），數量 1', () => {
    for (const d of spellbookDrops) {
      expect(d.dropValue).toBe(0.1);
      expect(d.minAmount).toBe(1);
      expect(d.maxAmount).toBe(1);
      expect(getDropRate(d.dropValue)).toBe('0.01%');
    }
  });

  it('掉落 id 都是 spellbook 類', () => {
    for (const id of SPELLBOOK_IDS) expect(getItemById(id)?.category).toBe('spellbook');
  });
});
