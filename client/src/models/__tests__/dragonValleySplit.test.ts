import { describe, it, expect } from 'vitest';
import { getRegion, resolveArea } from '../mapData';
import { MAP_DESIGN_PROFILES } from '../mapDesignRules';
import { AREA_POOLS, TOWN_AREA_POOLS, MONSTER_POOLS } from '../adventurerQuest';
import { MONSTER_SEEDS } from '../../db/seed/monsterSeeds';
import { DROP_TABLE_SEEDS } from '../../db/seed/dropSeeds';
import { ITEM_DEFINITIONS } from '../../db/seed/itemSeeds';

/**
 * 龍之谷地表拆成外圍（Lv.30~35）與地表（Lv.36~40）（`09-dungeon.md` § 9.8）。
 *
 * 與 `forestSplit.test.ts` 同一套把關：拆區牽動六張表（region／怪物 seed／掉落／
 * 任務池／地圖 profile／地圖 JSON），漏掉任何一張都不會報錯，只會靜默少掉東西。
 */

const CHAIN = [
  { id: 'dragon-valley-outskirts', levelMin: 30, levelMax: 35 },
  { id: 'dragon-valley-surface', levelMin: 36, levelMax: 40 },
];

/** 外圍限定素材（`30-items.md`）：只能在外圍掉 */
const EXCLUSIVE_MATERIAL = { area: 'dragon-valley-outskirts', name: '龍蛻碎片' };

/** 龍之谷區塊的高階骷髏系一律無屬性（`25-monster-system.md` § 25.8） */
const DRAGON_VALLEY_SKELETONS = ['高階骷髏神射手', '高階骷髏警衛', '高階骷髏斥候', '高階骷髏鬥士', '高階骷髏將領'];

describe('龍之谷地表拆分', () => {
  it('兩區都存在，等級連續不重疊', () => {
    for (const [i, expected] of CHAIN.entries()) {
      const region = getRegion(expected.id);
      expect(region, `${expected.id} 不存在`).toBeDefined();
      expect(region!.type).toBe('field');
      expect(region!.levelMin, expected.id).toBe(expected.levelMin);
      expect(region!.levelMax, expected.id).toBe(expected.levelMax);
      if (i > 0) expect(expected.levelMin).toBe(CHAIN[i - 1].levelMax + 1);
    }
  });

  it('每區 5 種怪，且 region.monsters 與 seed 的 area 完全對應', () => {
    for (const { id } of CHAIN) {
      const listed = getRegion(id)!.monsters ?? [];
      const seeded = MONSTER_SEEDS.filter(m => m.area === id).map(m => m.name);
      expect(listed, `${id} 應有 5 種怪`).toHaveLength(5);
      expect([...seeded].sort(), `${id} 的 seed 與 region.monsters 不一致`).toEqual([...listed].sort());
    }
  });

  it('怪物等級落在所屬區域的等級區間內', () => {
    for (const { id, levelMin, levelMax } of CHAIN) {
      for (const monster of MONSTER_SEEDS.filter(m => m.area === id)) {
        expect(monster.level, `${monster.name}@${id}`).toBeGreaterThanOrEqual(levelMin);
        expect(monster.level, `${monster.name}@${id}`).toBeLessThanOrEqual(levelMax);
      }
    }
  });

  it('龍之谷區塊（外圍／地表／地間）的高階骷髏系全為無屬性', () => {
    const inZone = MONSTER_SEEDS.filter(m => m.area.startsWith('dragon-valley'));
    const skeletons = inZone.filter(m => DRAGON_VALLEY_SKELETONS.includes(m.name));
    expect(skeletons.length).toBeGreaterThan(0);
    for (const monster of skeletons) {
      expect(monster.element, `${monster.name}@${monster.area}`).toBe('none');
    }
  });

  it('外圍有掉落表，限定素材只在外圍掉', () => {
    const drops = DROP_TABLE_SEEDS.filter(d => d.area === EXCLUSIVE_MATERIAL.area);
    expect(drops.length, '外圍沒有掉落表').toBeGreaterThan(0);
    expect(drops.some(d => d.itemType === 'gold'), '外圍沒有金幣掉落').toBe(true);

    const item = ITEM_DEFINITIONS.find(i => i.name === EXCLUSIVE_MATERIAL.name);
    expect(item, `找不到道具「${EXCLUSIVE_MATERIAL.name}」`).toBeDefined();
    const areas = [...new Set(DROP_TABLE_SEEDS.filter(d => d.itemTemplateId === item!.id).map(d => d.area))];
    expect(areas, `${EXCLUSIVE_MATERIAL.name} 應為外圍限定`).toEqual([EXCLUSIVE_MATERIAL.area]);
  });

  it('兩區都進 A 級任務池，且同時掛在兩座陣營城鎮（§ 36.12.3 共享區域）', () => {
    const inPool = (pool: { areaId: string }[] | undefined, id: string) =>
      (pool ?? []).some(entry => entry.areaId === id);

    for (const { id } of CHAIN) {
      expect(inPool(AREA_POOLS.A, id), `${id} 不在 A 級區域池`).toBe(true);
      expect(MONSTER_POOLS.A.some(m => m.area === id), `${id} 的怪沒進 A 級怪物池`).toBe(true);
      expect(inPool(TOWN_AREA_POOLS['elsarth-town'].A, id), `${id} 不在艾爾薩斯池`).toBe(true);
      expect(inPool(TOWN_AREA_POOLS['varden-town'].A, id), `${id} 不在瓦爾登池`).toBe(true);
    }
  });

  it('兩區都有地圖個性指派，且彼此相異（§ 38.11.2）', () => {
    const signatures = CHAIN.map(({ id }) => {
      const profile = MAP_DESIGN_PROFILES[id];
      expect(profile, `${id} 缺少 profile`).toBeDefined();
      return `${profile.density}/${profile.dominantTerrain}`;
    });
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('resolveArea 認得新區（掉落與詞綴階級靠它取區域等級）', () => {
    for (const { id, levelMin, levelMax } of CHAIN) {
      const resolved = resolveArea(id);
      expect(resolved, `${id} 解析不到`).toBeDefined();
      expect(resolved!.levelMin).toBe(levelMin);
      expect(resolved!.levelMax).toBe(levelMax);
    }
  });
});
