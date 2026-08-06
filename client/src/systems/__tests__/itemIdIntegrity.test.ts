import { describe, it, expect } from 'vitest';
import { getItemId, getItemById } from '../../models/items';
import { ITEM_DEFINITIONS } from '../../db/seed/itemSeeds';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { POTION_CONFIG, SPEED_POTION_CONFIG, addPotionToBag } from '../../stores/gameStore';
import type { PotionType } from '../../stores/gameStore';
import { CLASS_SKILLS } from '../../models/classSkills';
import { QUEST_MATERIAL_NAME } from '../../models/quest';
import { ALL_TOWN_SCROLLS } from '../../models/townScroll';
import { CURE_ITEMS } from '../../models/cureItem';
import { SIGIL_DEFINITIONS } from '../../models/sigil';
import { REGIONS, getRequiredScrollItemId, getRegion } from '../../models/mapData';

/**
 * 背包／倉庫以道具 id 為鍵（`99-ai-constraints.md` § 99.1），
 * 因此**每一張以 id 指涉道具的設定表都必須指得到東西** ——
 * 指到不存在的 id 不會報錯，只會讓那格道具在遊戲裡人間蒸發。
 * 這裡把所有這類設定一次掃過。
 */
describe('設定表引用的道具 id 都存在於 seed', () => {
  it('道具名稱在 seed 裡唯一（遷移時的名稱反查才不會取到錯的那筆）', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const item of ITEM_DEFINITIONS) {
      if (seen.has(item.name)) dupes.push(item.name);
      seen.add(item.name);
    }
    expect(dupes).toEqual([]);
  });

  it('道具 id 唯一', () => {
    const ids = ITEM_DEFINITIONS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('藥水設定（基礎與加速）的 id 與顯示名和 seed 一致', () => {
    for (const cfg of [...Object.values(POTION_CONFIG), ...Object.values(SPEED_POTION_CONFIG)]) {
      expect(getItemById(cfg.itemId)?.name, cfg.name).toBe(cfg.name);
    }
  });

  it('addPotionToBag 寫進去的 id 與名稱由 seed 反查而來', () => {
    for (const type of Object.keys(POTION_CONFIG) as PotionType[]) {
      const [entry] = addPotionToBag([], type, 1);
      expect(entry.itemId).toBe(POTION_CONFIG[type].itemId);
      expect(entry.name).toBe(getItemById(entry.itemId)?.name);
      expect(entry.type).toBe('potion');
    }
  });

  it('職業技能書（25 本）與任務素材', () => {
    expect(CLASS_SKILLS.length).toBe(25);
    for (const def of CLASS_SKILLS) {
      expect(getItemById(def.bookItemId), def.name).toBeDefined();
    }
    expect(getItemId(QUEST_MATERIAL_NAME)).toBeTypeOf('number');
  });

  it('回城卷軸、狀態解除道具、印記', () => {
    for (const scroll of ALL_TOWN_SCROLLS) {
      expect(getItemById(scroll.itemId)?.name, scroll.name).toBe(scroll.name);
    }
    for (const cure of CURE_ITEMS) {
      expect(getItemById(cure.itemId)?.name, cure.name).toBe(cure.name);
    }
    for (const sigil of SIGIL_DEFINITIONS) {
      expect(getItemById(sigil.itemId)?.name, sigil.name).toBe(sigil.name);
    }
  });

  it('區域通行卷軸（獨立 region）', () => {
    const gated = REGIONS.filter(r => r.entryScrollItemId);
    expect(gated.length).toBeGreaterThan(0);
    for (const r of gated) {
      expect(getItemById(r.entryScrollItemId!), r.name).toBeDefined();
    }
  });

  /**
   * `requiresScroll` 是舊的「一個 region 分多段」機制，百柱塔改成十個獨立 region 後
   * 目前沒有區域在用。留著是因為機制本身仍是活的（`navigation.ts` 有分支），
   * 之後若有區域啟用，這條會立刻檢查它組出來的卷軸名反查得到 id。
   */
  it('分段副本的通行卷軸每一段都反查得到（名稱組字串是唯一的例外路徑）', () => {
    const dungeons = REGIONS.filter(r => r.requiresScroll && r.scrollSegmentSize);
    for (const region of dungeons) {
      const floors = getRegion(region.id)?.floors ?? [];
      const gatedFloors = floors.filter(f => f.floor > region.scrollSegmentSize!);
      for (const f of gatedFloors) {
        expect(getRequiredScrollItemId(region.id, f.floor), `${region.name} ${f.floor}F`).toBeTypeOf('number');
      }
    }
  });

  it('裝備配方材料', () => {
    const ids = new Set(EQUIPMENT_SEEDS.flatMap(e => e.craftMaterials?.map(m => m.itemId) ?? []));
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) {
      expect(getItemById(id), String(id)).toBeDefined();
    }
  });
});
