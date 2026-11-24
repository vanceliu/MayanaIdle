import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MONSTER_SEEDS } from '../seed/monsterSeeds';
import { ITEM_DEFINITIONS } from '../seed/itemSeeds';
import { BOSS_DROP_TABLE_SEEDS, UNIQUE_MONSTER_DROPS } from '../seed/dropSeeds';
import { getItemById, getItemId } from '../../models/items';
import { getMonsterTemplates } from '../../models/monsterTemplates';
import { getMonstersAtLocation } from '../../models/mapData';
import type { MonsterRace, ElementType } from '../../models/monster';
import type { PlayerDebuffType } from '../../models/playerDebuff';

/**
 * 獨特魔物 seed 對照設計文件（`25-monster-system.md` § 25.8／§ 25.13、`28-monster-stats.md` § 28.10、
 * `27-drop-table.md` § 27.10、`30-items.md` § 30.2「獨特材料」）。
 */

const doc = (file: string) => readFileSync(resolve(__dirname, '../../../../docs/design', file), 'utf-8');
const section = (text: string, start: string, end: string) => text.split(start)[1].split(end)[0];
const cells = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());
const tableRows = (text: string) => text.split('\n').filter(l => l.startsWith('|') && !/^\|\s*-/.test(l)).map(cells);

const uniques = MONSTER_SEEDS.filter(m => m.isUnique);
const uniqueNames = [...new Set(uniques.map(m => m.name))];
const seedsOf = (name: string) => uniques.filter(m => m.name === name);

const RACE: Record<string, MonsterRace> = { 一般: 'normal', 不死: 'undead', 惡魔: 'demon', 龍: 'dragon' };
const ELEMENT: Record<string, ElementType> = { 冰: 'ice', 闇: 'dark', 地: 'earth', 火: 'fire', 光: 'light', 風: 'wind', 無: 'none' };
const DEBUFF: Record<string, PlayerDebuffType> = {
  中毒: 'poison', 暈眩: 'stun', 虛弱: 'weaken', 沉默: 'silence', 減速: 'slow', 詛咒: 'curse', 流血: 'bleed',
};
const ATTACK: Record<string, { type?: 'ranged' | 'magic'; range?: number }> = {
  近戰: {}, 遠程物理: { type: 'ranged', range: 10 }, 遠程魔法: { type: 'magic', range: 8 },
};

/** § 25.13.2 名單：地圖（組）、出現方式、名稱、Lv、攻擊型別 */
const ROSTER = tableRows(section(doc('25-monster-system.md'), '### 25.13.2 名單', '- 數量'))
  .slice(1)
  .map(([, group, mode, name, level, attack]) => ({ group, mode: mode.replace(/`/g, ''), name, level: Number(level), attack }));

/** § 25.8 各區域表中標「（獨特）」的列 */
const TRAITS = new Map(
  tableRows(section(doc('25-monster-system.md'), '## 25.8 怪物屬性表', '## 25.9'))
    .filter(r => r[0]?.endsWith('（獨特）'))
    .map(([name, race, size, element, debuffs, chance]) => [name.replace('（獨特）', ''), { race, size, element, debuffs, chance }]),
);

/** § 28.10 素質表 */
const STATS = new Map(
  tableRows(section(doc('28-monster-stats.md'), '## 28.10 獨特魔物', '## 28.11'))
    .slice(1)
    .map(([name, group, level, hp, attack, defense, exp]) => {
      const [attackMin, attackMax] = attack.split('~').map(Number);
      const num = (v: string) => Number(v.replace(/,/g, ''));
      return [name, { group, level: Number(level), hp: num(hp), attackMin, attackMax, defense: num(defense), exp: num(exp) }];
    }),
);

/** § 27.10「獨特魔物 → 掉落表欄位」 */
const DROP_COLUMNS = new Map(
  tableRows(section(doc('27-drop-table.md'), '### 獨特魔物 → 掉落表欄位', '\n## '))
    .filter(r => r.length === 5 && r[0] !== '獨特魔物')
    .map(([name, , , column, material]) => [name, { column, material }]),
);

/** `30-items.md` § 30.2「獨特材料」 */
const MATERIAL_ROWS = new Map(
  tableRows(section(doc('30-items.md'), '#### 獨特材料', '#### 素材 iconTier 對照'))
    .slice(1)
    .map(([name, weight, price, source]) => [name, { weight: Number(weight), sellPrice: Number(price.replace(/[G,]/g, '')), source }]),
);

const COLUMN_ID: Record<string, string> = {
  '隨機 Lv.33~40': 'random-33-40', '隨機 Lv.42~45': 'random-42-45', '隨機 Lv.46~49': 'random-46-49',
  '隨機 Lv.55': 'random-55', '隨機 Lv.60': 'random-60',
  '定時 Lv.40': 'timed-40', '定時 Lv.42': 'timed-42', '定時 Lv.46': 'timed-46', '定時 Lv.50': 'timed-50', '定時 Lv.55': 'timed-55',
};

describe('獨特魔物 seed（§ 25.13）', () => {
  it('文件解析到 36 隻，seed 名單一致', () => {
    expect(ROSTER).toHaveLength(36);
    expect(STATS.size).toBe(36);
    expect(TRAITS.size).toBe(36);
    expect([...uniqueNames].sort()).toEqual(ROSTER.map(r => r.name).sort());
  });

  it('不是 Boss、一律大型', () => {
    for (const m of uniques) {
      expect(m.isBoss, m.name).toBe(false);
      expect(m.size, m.name).toBe('large');
    }
  });

  it('素質與 § 28.10 完全一致（多樓層每筆相同）', () => {
    for (const m of uniques) {
      const s = STATS.get(m.name)!;
      expect({ level: m.level, hp: m.hp, attackMin: m.attackMin, attackMax: m.attackMax, defense: m.defense, exp: m.exp }, m.name)
        .toEqual({ level: s.level, hp: s.hp, attackMin: s.attackMin, attackMax: s.attackMax, defense: s.defense, exp: s.exp });
    }
  });

  it('種族、元素、debuff 依 § 25.8（觸發率 15%，Lv.55 以上 18%，依表格順序）', () => {
    for (const m of uniques) {
      const t = TRAITS.get(m.name)!;
      expect(m.race, m.name).toBe(RACE[t.race]);
      expect(t.size, m.name).toBe('大型');
      expect(m.element, m.name).toBe(ELEMENT[t.element]);
      const chance = m.level >= 55 ? 18 : 15;
      expect(t.chance, m.name).toBe(`各 ${chance}%`);
      expect(m.debuffs, m.name).toEqual(t.debuffs.split('、').map(d => ({ type: DEBUFF[d], chance })));
    }
  });

  it('攻擊型別與出現方式依 § 25.13.2', () => {
    for (const r of ROSTER) {
      for (const m of seedsOf(r.name)) {
        const attack = ATTACK[r.attack];
        expect(m.attackType, r.name).toBe(attack.type);
        expect(m.attackRange, r.name).toBe(attack.range);
        expect(m.level, r.name).toBe(r.level);
        expect(m.spawnMode, r.name).toBe(r.mode);
      }
    }
    const count = (mode: string) => ROSTER.filter(r => r.mode === mode).length;
    expect([count('random'), count('every10min'), count('halfHourGroup')]).toEqual([18, 12, 6]);
  });

  it('定時出現必填 spawnGroup，同組素質相同；random 不分組', () => {
    for (const m of uniques) {
      if (m.spawnMode === 'random') expect(m.spawnGroup, m.name).toBeUndefined();
      else expect(m.spawnGroup, m.name).toBeTruthy();
    }
    const groups = new Map<string, typeof uniques>();
    for (const m of uniques.filter(u => u.spawnGroup)) groups.set(m.spawnGroup!, [...(groups.get(m.spawnGroup!) ?? []), m]);
    expect([...groups.keys()].sort()).toEqual([
      'ancient-dungeon-1-2f', 'ancient-dungeon-3-4f', 'demon-altar', 'dragon-valley-3-4f',
      'dragon-valley-surface', 'ivory-tower-3f', 'ivory-tower-4f', 'shattered-mirror',
    ]);
    for (const [group, members] of groups) {
      const stats = new Set(members.map(m => `${m.level}/${m.hp}/${m.attackMin}/${m.attackMax}/${m.defense}/${m.exp}`));
      expect(stats.size, group).toBe(1);
      expect(new Set(members.map(m => m.spawnMode)).size, group).toBe(1);
    }
  });

  it('多樓層地圖組的每一層都有同一份名單', () => {
    const floors: Record<string, string[]> = {
      骷髏軍團長: ['dragon-valley-1f', 'dragon-valley-2f'],
      大莫蜘蛛女王: ['dragon-valley-3f', 'dragon-valley-4f'],
      骷髏神射將: ['dragon-valley-3f', 'dragon-valley-4f'],
      骷髏親衛隊長: ['dragon-valley-3f', 'dragon-valley-4f'],
      怨魂聚合體: ['dragon-valley-5f', 'dragon-valley-6f'],
      遠古獄卒長: ['ancient-dungeon-1f', 'ancient-dungeon-2f'],
      遠古狙擊官: ['ancient-dungeon-1f', 'ancient-dungeon-2f'],
      遠古典獄官: ['ancient-dungeon-3f', 'ancient-dungeon-4f'],
      遠古弓術長: ['ancient-dungeon-3f', 'ancient-dungeon-4f'],
      封印術士: ['ancient-dungeon-3f', 'ancient-dungeon-4f'],
      封印屍王: ['ancient-dungeon-5f', 'ancient-dungeon-6f'],
      遠古食人妖精王: ['ancient-dungeon-7f', 'ancient-dungeon-8f'],
    };
    for (const name of uniqueNames) {
      const areas = seedsOf(name).map(m => m.area).sort();
      expect(areas, name).toEqual(floors[name] ?? [areas[0]]);
    }
    expect(uniques).toHaveLength(36 + 12);
  });

  it('只放在本身沒有 Boss 的地圖／樓層', () => {
    for (const m of uniques) {
      expect(getMonsterTemplates(m.area).some(t => t.isBoss), m.area).toBe(false);
    }
  });

  it('區域／樓層的怪物名單列出所在的獨特魔物', () => {
    for (const m of uniques) {
      const match = m.area.match(/^(.+)-(\d+)f$/);
      const listed = match ? getMonstersAtLocation(match[1], Number(match[2])) : getMonstersAtLocation(m.area, null);
      expect(listed, m.area).toContain(m.name);
    }
  });

  it('id 唯一，接在既有怪物之後', () => {
    const ids = MONSTER_SEEDS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const firstUnique = Math.min(...uniques.map(m => m.id!));
    expect(MONSTER_SEEDS.filter(m => !m.isUnique).every(m => m.id! < firstUnique)).toBe(true);
  });
});

describe('獨特材料（`30-items.md` § 30.2）', () => {
  it('36 種，重量 5、賣價依文件、iconTier 6', () => {
    expect(MATERIAL_ROWS.size).toBe(36);
    for (const [name, row] of MATERIAL_ROWS) {
      const def = ITEM_DEFINITIONS.find(d => d.name === name);
      expect(def, name).toBeDefined();
      expect(def!.category, name).toBe('material');
      expect(def!.weight, name).toBe(5);
      expect(row.weight, name).toBe(5);
      expect(def!.sellPrice, name).toBe(row.sellPrice);
      expect(def!.iconTier, name).toBe(6);
      expect(def!.noSell, name).toBeUndefined();
    }
  });

  it('賣價依來源等級：Lv.33~36 500G、Lv.38~55 800G、Lv.60 900G', () => {
    for (const { monster, materialItemId } of UNIQUE_MONSTER_DROPS) {
      const level = seedsOf(monster)[0].level;
      const expected = level <= 36 ? 500 : level <= 55 ? 800 : 900;
      expect(getItemById(materialItemId)!.sellPrice, monster).toBe(expected);
    }
  });

  it('道具 id 唯一', () => {
    const ids = ITEM_DEFINITIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('獨特魔物掉落表（`27-drop-table.md` § 27.10）', () => {
  const tableOf = (name: string) => BOSS_DROP_TABLE_SEEDS.filter(d => d.bossName === name);
  const valueOf = (name: string, itemName: string) =>
    tableOf(name).filter(d => d.itemTemplateId === getItemId(itemName)).map(d => d.dropValue);

  it('每隻都有掉落表，欄位與獨特材料依文件', () => {
    expect(DROP_COLUMNS.size).toBe(36);
    expect(UNIQUE_MONSTER_DROPS).toHaveLength(36);
    for (const { monster, column, materialItemId } of UNIQUE_MONSTER_DROPS) {
      const docRow = DROP_COLUMNS.get(monster)!;
      expect(column, monster).toBe(COLUMN_ID[docRow.column]);
      expect(getItemById(materialItemId)!.name, monster).toBe(docRow.material);
      expect(MATERIAL_ROWS.get(docRow.material)!.source.startsWith(monster), monster).toBe(true);
      expect(valueOf(monster, docRow.material), monster).toEqual([100]);
    }
  });

  it('金幣固定值與裝備列依欄位', () => {
    const expected: Record<string, { gold: number; equipment: string[] }> = {
      'random-33-40': { gold: 300, equipment: ['4:5'] },
      'random-42-45': { gold: 500, equipment: ['4:5'] },
      'random-46-49': { gold: 500, equipment: ['5:5'] },
      'random-55': { gold: 660, equipment: ['5:5'] },
      'random-60': { gold: 660, equipment: ['5:5', '6:1'] },
      'timed-40': { gold: 300, equipment: ['4:10'] },
      'timed-42': { gold: 500, equipment: ['4:10'] },
      'timed-46': { gold: 500, equipment: ['5:10'] },
      'timed-50': { gold: 660, equipment: ['5:10'] },
      'timed-55': { gold: 660, equipment: ['5:10'] },
    };
    for (const { monster, column } of UNIQUE_MONSTER_DROPS) {
      const rows = tableOf(monster);
      const gold = rows.filter(d => d.itemType === 'gold');
      expect(gold, monster).toEqual([expect.objectContaining({ dropValue: 1000, minAmount: expected[column].gold, maxAmount: expected[column].gold })]);
      const equipment = rows.filter(d => d.itemType === 'equipment');
      for (const pool of ['weapon', 'armor'] as const) {
        expect(equipment.filter(d => d.equipmentPool === pool).map(d => `${d.tier}:${d.dropValue}`), `${monster} ${pool}`)
          .toEqual(expected[column].equipment);
      }
    }
  });

  it('印記與強化卷軸：隨機出現與定時出現各依表', () => {
    for (const { monster, column } of UNIQUE_MONSTER_DROPS) {
      const timed = column.startsWith('timed');
      const k = timed ? 2 : 1;
      for (const sigil of ['混沌印記', '刺針印記', '重刻印記', '新增印記', '封印印記', '工藝印記', '精鍊印記']) {
        expect(valueOf(monster, sigil), `${monster} ${sigil}`).toEqual([20 * k]);
      }
      expect(valueOf(monster, '突破印記'), monster).toEqual([10 * k]);
      for (const scroll of ['武器強化卷軸', '防具強化卷軸']) expect(valueOf(monster, scroll), `${monster} ${scroll}`).toEqual([10 * k]);
      for (const scroll of ['武器強化卷軸＋', '武器強化卷軸－', '防具強化卷軸＋', '防具強化卷軸－']) {
        expect(valueOf(monster, scroll), `${monster} ${scroll}`).toEqual([2 * k]);
      }
      // 金幣 1、材料 1、裝備 2 或 4、印記 8、卷軸 6
      expect(tableOf(monster), monster).toHaveLength(column === 'random-60' ? 20 : 18);
    }
  });

  it('Boss 專屬素材掉落值一律 100（10%）', () => {
    const bossNames = new Set(MONSTER_SEEDS.filter(m => m.isBoss).map(m => m.name));
    const bossMaterials = BOSS_DROP_TABLE_SEEDS.filter(d => {
      const def = d.itemTemplateId ? getItemById(d.itemTemplateId) : undefined;
      return bossNames.has(d.bossName) && def?.category === 'material' && (def.iconTier ?? 0) >= 6;
    });
    expect(bossMaterials).toHaveLength(17);
    for (const d of bossMaterials) expect(d.dropValue, d.bossName).toBe(100);
  });

  it('掉落表 id 不與既有表重複', () => {
    const ids = BOSS_DROP_TABLE_SEEDS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
