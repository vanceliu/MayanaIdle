import { describe, it, expect, vi, afterEach } from 'vitest';

const generateAffixesSpy = vi.fn();
vi.mock('../../models/affix', async () => {
  const actual = await vi.importActual<typeof import('../../models/affix')>('../../models/affix');
  return {
    ...actual,
    generateAffixes: (...args: Parameters<typeof actual.generateAffixes>) => {
      generateAffixesSpy(...args);
      return actual.generateAffixes(...args);
    },
  };
});

import { rollBossDrops } from '../drops';
import {
  rollClassSkillBookDrops,
  ALL_CLASS_SKILL_BOOKS,
  SKILL_BOOK_UNIQUE_DROP_RATE,
  SKILL_BOOK_DROP_RATE,
} from '../classSkillBookDrop';
import { rollTalentSlotDrop } from '../talentDrops';
import { SLOT_DROP_RATE_UNIQUE } from '../../models/talent';
import { BUFF_POTION_ITEM_IDS } from '../../models/buffPotion';
import { BOSS_DROP_TABLE_SEEDS, DROP_TABLE_SEEDS } from '../../db/seed/dropSeeds';
import { getItemId } from '../../models/items';
import { monsterRank } from '../../models/monster';

const NO_BONUS = { drop_rate: 0, gold_rate: 0 };

/** 固定序列的 rng，讓「命中／不命中」測得起來 */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

afterEach(() => {
  vi.restoreAllMocks();
  generateAffixesSpy.mockClear();
});

describe('monsterRank', () => {
  it('Boss／獨特魔物／一般怪', () => {
    expect(monsterRank({ isBoss: true })).toBe('boss');
    expect(monsterRank({ isBoss: false, isUnique: true })).toBe('unique');
    expect(monsterRank({ isBoss: false })).toBe('normal');
  });
});

describe('獨特魔物掉落只查自己的表（`27-drop-table.md` § 27.10）', () => {
  const NAME = '冰牙狼王';
  const ownItemIds = new Set(BOSS_DROP_TABLE_SEEDS.filter(d => d.bossName === NAME).map(d => d.itemTemplateId).filter(Boolean));
  const skillBookIds = new Set(ALL_CLASS_SKILL_BOOKS.map(b => b.itemId));

  it('全部命中時：固定金幣、獨特材料、自己表上的印記與卷軸、增益藥水、技能書，沒有區域掉落物', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = await rollBossDrops(NAME, 1, 33, NO_BONUS, undefined, undefined, undefined, 'unique');

    expect(result.gold).toBe(300);
    const itemIds = result.items.filter(i => !i.equipmentInstance).map(i => i.itemTemplateId!);
    expect(itemIds).toContain(getItemId('冰牙狼王之牙'));
    for (const potion of BUFF_POTION_ITEM_IDS) expect(itemIds).toContain(potion);
    expect(itemIds.some(id => skillBookIds.has(id))).toBe(true);
    const foreign = itemIds.filter(id => !ownItemIds.has(id) && !BUFF_POTION_ITEM_IDS.includes(id) && !skillBookIds.has(id));
    expect(foreign).toEqual([]);

    const areaOnly = DROP_TABLE_SEEDS
      .filter(d => d.area === 'snow-field' && d.itemTemplateId != null && !ownItemIds.has(d.itemTemplateId))
      .map(d => d.itemTemplateId);
    expect(areaOnly.length).toBeGreaterThan(0);
    expect(itemIds.filter(id => areaOnly.includes(id))).toEqual([]);

    const equipment = result.items.filter(i => i.equipmentInstance);
    expect(equipment).toHaveLength(1);
    expect(equipment[0].equipmentTier).toBe(4);
  });

  it('裝備用 Boss 詞綴權重與特殊詞綴 ×2（isBoss 旗標為 true）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await rollBossDrops(NAME, 1, 33, NO_BONUS, undefined, undefined, undefined, 'unique');
    expect(generateAffixesSpy).toHaveBeenCalled();
    for (const call of generateAffixesSpy.mock.calls) expect(call[3]).toBe(true);
  });

  it('技能書走獨特魔物基礎掉率 0.25%，不是 Boss 的 2.5%', async () => {
    // 0.003：表上 2% 的條目都中，技能書 0.25% 不中、2.5% 會中
    vi.spyOn(Math, 'random').mockReturnValue(0.003);
    const books = (items: { itemTemplateId?: number }[]) => items.filter(i => skillBookIds.has(i.itemTemplateId!));
    const unique = await rollBossDrops(NAME, 1, 33, NO_BONUS, undefined, undefined, undefined, 'unique');
    expect(books(unique.items)).toHaveLength(0);
    const asBoss = await rollBossDrops(NAME, 1, 33, NO_BONUS, undefined, undefined, undefined, 'boss');
    expect(books(asBoss.items).length).toBeGreaterThan(0);
  });

  it('定時出現的表：印記與卷軸為隨機出現的 2 倍', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.03);
    const timed = await rollBossDrops('霜甲隊長', 1, 40, NO_BONUS, undefined, undefined, undefined, 'unique');
    const random = await rollBossDrops('冰晶蝙蝠王', 1, 36, NO_BONUS, undefined, undefined, undefined, 'unique');
    const has = (items: { itemTemplateId?: number }[], name: string) => items.some(i => i.itemTemplateId === getItemId(name));
    // 3%：定時 4% 的印記命中、隨機 2% 不中
    expect(has(timed.items, '混沌印記')).toBe(true);
    expect(has(random.items, '混沌印記')).toBe(false);
  });
});

describe('職業技能書基礎掉率（`23-class-magic.md` § 23.1）', () => {
  it('小怪 0.025%、獨特魔物 0.25%、Boss 2.5%', () => {
    expect(SKILL_BOOK_DROP_RATE).toEqual({ normal: 0.00025, unique: 0.0025, boss: 0.025 });
  });

  it('獨特魔物：低於 0.25% 掉、高於不掉', () => {
    vi.spyOn(Math, 'random').mockReturnValue(SKILL_BOOK_UNIQUE_DROP_RATE * 0.9);
    expect(rollClassSkillBookDrops(35, 'unique')).toHaveLength(1);
    vi.spyOn(Math, 'random').mockReturnValue(SKILL_BOOK_UNIQUE_DROP_RATE * 1.1);
    expect(rollClassSkillBookDrops(35, 'unique')).toHaveLength(0);
  });
});

describe('天賦格（`27-drop-table.md` § 27.9）', () => {
  it('獨特魔物 0.1%（掉落值 1），區間同 Boss', () => {
    expect(SLOT_DROP_RATE_UNIQUE).toBe(0.1);
    expect(rollTalentSlotDrop(50, 'unique', 1, seq(0.0009, 0))).toBe(2);
    expect(rollTalentSlotDrop(50, 'unique', 1, seq(0.0011, 0))).toBeNull();
    expect(rollTalentSlotDrop(99, 'unique', 1, seq(0.0009, 0.99))).toBe(4);
  });

  it('只吃全域掉落倍率', () => {
    expect(rollTalentSlotDrop(50, 'unique', 2, seq(0.0019, 0))).toBe(2);
  });
});
