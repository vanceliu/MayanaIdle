import { describe, it, expect } from 'vitest';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../seed';
import { getItemById, getItemDefinition } from '../../models/items';
import { SIGIL_DEFINITIONS } from '../../models/sigil';

/**
 * 印記掉落（`27-drop-table.md` § 27.8）：混沌／刺針／重刻／突破在 Lv.31+ 的每個區域
 * 與每隻 Boss 都有，Lv.30 以下一個都沒有。掉率一般怪 1%（突破 0.1%）、Boss 5%（突破 1%）。
 *
 * 精鍊印記與工藝印記走**全區域**掉落（列在各區域掉落表內），不適用 § 27.8，故排除在外。
 */

/** § 27.8 適用區域 —— 區域最高等級 ≥ 31 */
const SIGIL_AREAS = [
  'snow-field', 'snow-field-deep',
  'ivory-tower-1f', 'ivory-tower-2f', 'ivory-tower-3f', 'ivory-tower-4f', 'ivory-tower-5f',
  'demon-forest', 'misty-cave-1f', 'misty-cave-2f', 'misty-cave-3f',
  'mirror-forest',
  'underwater-prison-1f', 'underwater-prison-2f', 'underwater-prison-3f', 'underwater-prison-4f',
  'dragon-valley-surface',
  'dragon-valley-1f', 'dragon-valley-2f', 'dragon-valley-3f', 'dragon-valley-4f',
  'dragon-valley-5f', 'dragon-valley-6f', 'dragon-valley-7f',
  'ancient-battlefield',
  'hundred-pillar-1-10f', 'hundred-pillar-11-20f', 'hundred-pillar-21-30f',
  'hundred-pillar-31-40f', 'hundred-pillar-41-50f', 'hundred-pillar-51-60f',
  'hundred-pillar-61-70f', 'hundred-pillar-71-80f', 'hundred-pillar-81-90f',
  'hundred-pillar-91-100f',
  'ancient-dungeon-1f', 'ancient-dungeon-2f', 'ancient-dungeon-3f',
  'ancient-dungeon-4f', 'ancient-dungeon-5f', 'ancient-dungeon-6f',
  'ancient-dungeon-7f', 'ancient-dungeon-8f', 'ancient-dungeon-9f',
];

/** Lv.30 以下的區域 —— 一個印記都不該有 */
const LOW_LEVEL_AREAS = [
  'dawn-plains', 'green-valley', 'wind-woods', 'misty-swamp',
  'trial-highlands', 'trial-highlands-top',
];

/** § 27.8 只涵蓋這四種；精鍊／工藝走全區域掉落 */
const AREA_WIDE_SIGILS = ['精鍊印記', '工藝印記'];
const SIGIL_NAMES = SIGIL_DEFINITIONS
  .map(d => d.name)
  .filter(n => !AREA_WIDE_SIGILS.includes(n));
const SIGIL_IDS = new Set(
  SIGIL_DEFINITIONS.filter(d => !AREA_WIDE_SIGILS.includes(d.name)).map(d => d.itemId),
);

/** 突破印記比其他三種稀有一個數量級（§ 27.8） */
const NORMAL_VALUE = (name: string) => (name === '突破印記' ? 1 : 10);
const BOSS_VALUE = (name: string) => (name === '突破印記' ? 10 : 50);

function sigilDropsOf(area: string) {
  return DROP_TABLE_SEEDS.filter(
    d => d.area === area && d.itemTemplateId != null && SIGIL_IDS.has(d.itemTemplateId),
  );
}

function bossSigilDropsOf(boss: string) {
  return BOSS_DROP_TABLE_SEEDS.filter(
    d => d.bossName === boss && d.itemTemplateId != null && SIGIL_IDS.has(d.itemTemplateId),
  );
}

describe('印記掉落（§ 27.8）', () => {
  it('§ 27.8 的四種印記都有 ItemDefinition，不計重、賣價 500G（`30-items.md`）', () => {
    for (const name of SIGIL_NAMES) {
      const def = getItemDefinition(name);
      expect(def, name).toBeTruthy();
      expect(def!.category, name).toBe('scroll');
      expect(def!.weight, name).toBe(0);
      expect(def!.sellPrice, name).toBe(500);
    }
  });

  it('每個 Lv.31+ 區域都有這四種印記，掉落值 10／10／10／1', () => {
    for (const area of SIGIL_AREAS) {
      const drops = sigilDropsOf(area);
      expect(drops.map(d => getItemById(d.itemTemplateId!)!.name).sort(), area)
        .toEqual([...SIGIL_NAMES].sort());
      for (const drop of drops) {
        const name = getItemById(drop.itemTemplateId!)!.name;
        expect(drop.dropValue, `${area} 的 ${name}`).toBe(NORMAL_VALUE(name));
      }
    }
  });

  it('Lv.30 以下區域完全不掉這四種印記', () => {
    for (const area of LOW_LEVEL_AREAS) {
      expect(sigilDropsOf(area), area).toEqual([]);
    }
  });

  // § 30.2：精鍊與工藝走全區域掉落，是前期就拿得到的養成資源
  it('精鍊與工藝印記歸 scroll，且在 Lv.30 以下區域也掉', () => {
    for (const name of AREA_WIDE_SIGILS) {
      const def = getItemDefinition(name);
      expect(def, name).toBeTruthy();
      expect(def!.category, name).toBe('scroll');
      // § 30.2：六種印記一律不計重，全區域掉落的這兩種只有賣價不同
      expect(def!.weight, name).toBe(0);
      expect(def!.sellPrice, name).toBe(50);
      const areas = DROP_TABLE_SEEDS
        .filter(d => d.itemTemplateId === def!.id)
        .map(d => d.area);
      for (const low of LOW_LEVEL_AREAS) {
        expect(areas, `${name} 應該掉在 ${low}`).toContain(low);
      }
    }
  });

  it('沒有印記掉在 SIGIL_AREAS 以外的區域', () => {
    const areas = new Set(
      DROP_TABLE_SEEDS
        .filter(d => d.itemTemplateId != null && SIGIL_IDS.has(d.itemTemplateId))
        .map(d => d.area),
    );
    expect([...areas].sort()).toEqual([...SIGIL_AREAS].sort());
  });

  it('Lv.30 的試煉飛龍以外的 Boss 都掉這四種印記，掉落值 50／50／50／10', () => {
    const bosses = new Set(BOSS_DROP_TABLE_SEEDS.map(d => d.bossName));
    for (const boss of bosses) {
      const drops = bossSigilDropsOf(boss);
      if (boss === '試煉飛龍') {
        expect(drops, boss).toEqual([]);
        continue;
      }
      expect(drops.map(d => getItemById(d.itemTemplateId!)!.name).sort(), boss)
        .toEqual([...SIGIL_NAMES].sort());
      for (const drop of drops) {
        const name = getItemById(drop.itemTemplateId!)!.name;
        expect(drop.dropValue, `${boss} 的 ${name}`).toBe(BOSS_VALUE(name));
      }
    }
  });
});

/**
 * § 30.2：六種印記共用同一個圖示，只用顏色區分。
 * 印記走 `icon` + `iconColor`，不吃素材的 `iconType`／`iconTier` 色階 ——
 * 那套色階表達的是素材稀有度，套在印記上會讓玩家把印記讀成素材。
 */
describe('印記圖示（§ 30.2）', () => {
  const ALL_SIGILS = SIGIL_DEFINITIONS.map(d => d.name);

  it('六種印記共用 millenium-key，且不帶素材色階欄位', () => {
    for (const name of ALL_SIGILS) {
      const def = getItemDefinition(name);
      expect(def, name).toBeTruthy();
      expect(def!.icon, name).toBe('items/millenium-key');
      expect(def!.iconType, name).toBeUndefined();
      expect(def!.iconTier, name).toBeUndefined();
    }
  });

  it('六種顏色互不重複，玩家才分得出手上是哪一種', () => {
    const colors = ALL_SIGILS.map(name => getItemDefinition(name)!.iconColor);
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBe(ALL_SIGILS.length);
  });

  it('六種印記重量一律 0 —— 完全不計負重（§ 30.2）', () => {
    for (const name of ALL_SIGILS) {
      expect(getItemDefinition(name)!.weight, name).toBe(0);
    }
  });
});
