import { describe, it, expect } from 'vitest';
import { getRegion, resolveArea } from '../mapData';
import { MAP_DESIGN_PROFILES } from '../mapDesignRules';
import { AREA_POOLS, TOWN_AREA_POOLS, MONSTER_POOLS } from '../adventurerQuest';
import { MONSTER_SEEDS } from '../../db/seed/monsterSeeds';
import { DROP_TABLE_SEEDS } from '../../db/seed/dropSeeds';
import { ITEM_DEFINITIONS } from '../../db/seed/itemSeeds';

/**
 * 妖魔森林／明鏡森林各拆成三段（`09-dungeon.md` § 9.5、§ 9.6）。
 *
 * 拆區牽動六張表（region／怪物 seed／掉落／任務池／地圖 profile／地圖 JSON），
 * 漏掉任何一張都不會報錯，只會靜默少掉東西：怪物生不出來、區域刷不到素材、
 * 任務板永遠不出這一區。這支測試把六者綁在一起。
 */

/** 三段的等級必須連續且不重疊，缺口會讓玩家在該等級無區可去 */
const ELSARTH = [
  { id: 'demon-forest', levelMin: 30, levelMax: 33 },
  { id: 'rotleaf-path', levelMin: 34, levelMax: 36 },
  { id: 'demon-altar', levelMin: 37, levelMax: 40 },
];
const VARDEN = [
  { id: 'mirror-forest', levelMin: 30, levelMax: 33 },
  { id: 'glimmer-shore', levelMin: 34, levelMax: 36 },
  { id: 'shattered-mirror', levelMin: 37, levelMax: 40 },
];
const ALL = [...ELSARTH, ...VARDEN];

/** 該區限定的深段素材（`30-items.md`）：只能在自己那一區掉 */
const EXCLUSIVE_MATERIALS: Record<string, string> = {
  'rotleaf-path': '腐葉孢囊',
  'demon-altar': '祭壇黑曜石',
  'glimmer-shore': '湖鏡水晶',
  'shattered-mirror': '逆光鏡片',
};

function itemId(name: string): number {
  const item = ITEM_DEFINITIONS.find(i => i.name === name);
  expect(item, `找不到道具「${name}」`).toBeDefined();
  return item!.id;
}

describe('妖魔森林／明鏡森林三段拆分', () => {
  it('六個區域都存在，且等級三段連續不重疊', () => {
    for (const chain of [ELSARTH, VARDEN]) {
      for (const [i, expected] of chain.entries()) {
        const region = getRegion(expected.id);
        expect(region, `${expected.id} 不存在`).toBeDefined();
        expect(region!.type).toBe('field');
        expect(region!.levelMin, expected.id).toBe(expected.levelMin);
        expect(region!.levelMax, expected.id).toBe(expected.levelMax);
        if (i > 0) expect(expected.levelMin).toBe(chain[i - 1].levelMax + 1);
      }
    }
  });

  it('東西陣營對等：三段的等級區間完全一致', () => {
    for (const [i, west] of ELSARTH.entries()) {
      expect(west.levelMin).toBe(VARDEN[i].levelMin);
      expect(west.levelMax).toBe(VARDEN[i].levelMax);
    }
  });

  it('每區 5 種怪，且 region.monsters 與 seed 的 area 完全對應', () => {
    for (const { id } of ALL) {
      const listed = getRegion(id)!.monsters ?? [];
      const seeded = MONSTER_SEEDS.filter(m => m.area === id).map(m => m.name);
      expect(listed, `${id} 應有 5 種怪`).toHaveLength(5);
      expect([...seeded].sort(), `${id} 的 seed 與 region.monsters 不一致`).toEqual([...listed].sort());
    }
  });

  it('怪物等級落在所屬區域的等級區間內', () => {
    for (const { id, levelMin, levelMax } of ALL) {
      for (const monster of MONSTER_SEEDS.filter(m => m.area === id)) {
        expect(monster.level, `${monster.name}@${id}`).toBeGreaterThanOrEqual(levelMin);
        expect(monster.level, `${monster.name}@${id}`).toBeLessThanOrEqual(levelMax);
      }
    }
  });

  it('四個新區都有掉落表，且限定素材只在自己那一區掉', () => {
    for (const [area, material] of Object.entries(EXCLUSIVE_MATERIALS)) {
      const drops = DROP_TABLE_SEEDS.filter(d => d.area === area);
      expect(drops.length, `${area} 沒有掉落表`).toBeGreaterThan(0);
      expect(drops.some(d => d.itemType === 'gold'), `${area} 沒有金幣掉落`).toBe(true);

      const id = itemId(material);
      const areasWithMaterial = [...new Set(
        DROP_TABLE_SEEDS.filter(d => d.itemTemplateId === id).map(d => d.area),
      )];
      expect(areasWithMaterial, `${material} 應為 ${area} 限定`).toEqual([area]);
    }
  });

  it('六區都進 A 級任務池，且分屬各自城鎮的池', () => {
    const inPool = (pool: { areaId: string }[] | undefined, id: string) =>
      (pool ?? []).some(entry => entry.areaId === id);

    for (const { id } of ALL) {
      expect(inPool(AREA_POOLS.A, id), `${id} 不在 A 級區域池`).toBe(true);
      expect(MONSTER_POOLS.A.some(m => m.area === id), `${id} 的怪沒進 A 級怪物池`).toBe(true);
    }
    for (const { id } of ELSARTH) {
      expect(inPool(TOWN_AREA_POOLS['elsarth-town'].A, id), `${id} 不在艾爾薩斯池`).toBe(true);
      expect(inPool(TOWN_AREA_POOLS['varden-town'].A, id), `${id} 不該在瓦爾登池`).toBe(false);
    }
    for (const { id } of VARDEN) {
      expect(inPool(TOWN_AREA_POOLS['varden-town'].A, id), `${id} 不在瓦爾登池`).toBe(true);
      expect(inPool(TOWN_AREA_POOLS['elsarth-town'].A, id), `${id} 不該在艾爾薩斯池`).toBe(false);
    }
  });

  it('六區都有地圖個性指派，且同主題兩兩相異（§ 38.11.2）', () => {
    const signatures = ALL.map(({ id }) => {
      const profile = MAP_DESIGN_PROFILES[id];
      expect(profile, `${id} 缺少 profile`).toBeDefined();
      return `${profile.density}/${profile.dominantTerrain}`;
    });
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('resolveArea 認得新區（掉落與詞綴階級靠它取區域等級）', () => {
    for (const { id, levelMin, levelMax } of ALL) {
      const resolved = resolveArea(id);
      expect(resolved, `${id} 解析不到`).toBeDefined();
      expect(resolved!.levelMin).toBe(levelMin);
      expect(resolved!.levelMax).toBe(levelMax);
    }
  });
});
