/**
 * 六大基本屬性（`20-attributes.md` § 20.1）。
 *
 * 獨立成 leaf module：詞綴與裝備都要用到屬性的鍵與顯示名，
 * 但角色模組又要讀詞綴給的額外屬性 —— 常數留在 `character.ts` 會形成互相 import。
 * 這裡不放任何依賴角色或裝備的邏輯。
 */
export interface Attributes {
  STR: number;
  AGI: number;
  VIT: number;
  SPI: number;
  INT: number;
  CHA: number;
}

export const ATTRIBUTE_KEYS: (keyof Attributes)[] = ['STR', 'AGI', 'VIT', 'SPI', 'INT', 'CHA'];

/** 六大屬性的顯示名稱。所有 UI 與詞綴文字共用這一份，不各自複製。 */
export const ATTRIBUTE_NAMES_ZH: Record<keyof Attributes, string> = {
  STR: '力量', AGI: '敏捷', VIT: '體質', SPI: '精神', INT: '智力', CHA: '魅力',
};
