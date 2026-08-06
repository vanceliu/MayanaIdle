import { describe, it, expect } from 'vitest';
import { LEGACY_ITEM_RENAMES, RENAMED_ITEM_TABLES, renameLegacyItemRow } from '../database';
import { ITEM_DEFINITIONS } from '../seed/itemSeeds';

/**
 * Dexie v14 的道具改名遷移（`46-sigil.md` § 46.1）。
 * 背包／倉庫以名字為 key，舊名沒改到就等於玩家的存量憑空消失。
 */
describe('印記改名遷移（Dexie v14）', () => {
  it('三個舊名都對得上現在 seed 裡的道具', () => {
    const known = new Set(ITEM_DEFINITIONS.map(d => d.name));
    for (const [oldName, newName] of Object.entries(LEGACY_ITEM_RENAMES)) {
      expect(known.has(newName), `${newName} 不在 ITEM_DEFINITIONS`).toBe(true);
      expect(known.has(oldName), `${oldName} 應該已經從 seed 消失`).toBe(false);
    }
  });

  it('改名的同時把 material 改成 scroll', () => {
    const row: Record<string, unknown> = { name: '強化石', type: 'material', amount: 7 };
    renameLegacyItemRow(row);
    expect(row).toEqual({ name: '精鍊印記', type: 'scroll', amount: 7 });
  });

  it('已是 scroll 的突破印記只改名，分類不動', () => {
    const row: Record<string, unknown> = { name: '強化印記', type: 'scroll', amount: 2 };
    renameLegacyItemRow(row);
    expect(row).toEqual({ name: '突破印記', type: 'scroll', amount: 2 });
  });

  it('不在改名表上的道具原封不動', () => {
    const row: Record<string, unknown> = { name: '銀礦石', type: 'material', amount: 3 };
    renameLegacyItemRow(row);
    expect(row).toEqual({ name: '銀礦石', type: 'material', amount: 3 });
  });

  it('三張存道具的表都要遷移（漏掉倉庫等於只救回背包）', () => {
    expect([...RENAMED_ITEM_TABLES]).toEqual(['characterBag', 'characterStorage', 'warehouses']);
  });
});
