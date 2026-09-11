/**
 * 魔法學院的規則（`13-town.md` § 13.6、`22-magic-system.md`）。
 *
 * 放在 models 而不是元件裡：學習與製作的判定在 store（線上模式由 server 執行），
 * 規則留在元件等於 server 看不到它們。
 */

/** Lv1~3 的基礎魔法用金幣學，價格依級數 */
export const LEARN_PRICES: Record<number, number> = {
  1: 100,
  2: 500,
  3: 700,
};

/** 魔法書碎片（所有配方共用的素材） */
export const SPELLBOOK_FRAGMENT_ID = 127;

export interface SpellbookRecipe {
  /** 成品魔法書的 `ITEM_DEFINITIONS` id。名稱一律由 id 反查（§ 99.1） */
  bookItemId: number;
  levels: string;
  fragments: number;
  materialItemId: number;
  materialAmount: number;
}

export const SPELLBOOK_RECIPES: SpellbookRecipe[] = [
  { bookItemId: 97, levels: '4~5', fragments: 3, materialItemId: 128, materialAmount: 5 },
  { bookItemId: 98, levels: '6~7', fragments: 5, materialItemId: 129, materialAmount: 5 },
  { bookItemId: 99, levels: '8', fragments: 10, materialItemId: 130, materialAmount: 10 },
  { bookItemId: 100, levels: '9', fragments: 20, materialItemId: 131, materialAmount: 20 },
  { bookItemId: 101, levels: '10', fragments: 40, materialItemId: 131, materialAmount: 40 },
];

/** Lv4 以上要用對應級距的魔法書換，金幣買不到 */
export function getRequiredBookId(level: number): number | null {
  if (level >= 4 && level <= 5) return 97;
  if (level >= 6 && level <= 7) return 98;
  if (level === 8) return 99;
  if (level === 9) return 100;
  if (level === 10) return 101;
  return null;
}
