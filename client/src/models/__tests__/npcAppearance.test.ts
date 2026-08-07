import { describe, it, expect } from 'vitest';
import { NPC_APPEARANCES, getNpcAppearance } from '../npcAppearance';
import {
  MIN_EYE_CONTRAST,
  contrastRatio,
  createDefaultAppearance,
  normalizeAppearance,
  isHairStyleId,
  PALETTE,
  SKIN_TONES,
} from '../appearance';

/** `models/__tests__/townMaps.test.ts` 認得的設施 —— 每一個都要有外觀 */
const FACILITIES = [
  'general-store', 'blacksmith', 'weapon-shop', 'armor-shop', 'inn', 'storage',
  'magic-academy', 'class-guild', 'starter-npc', 'adventurer-guild',
  'statistics-center', 'sigil-master',
];

describe('城鎮 NPC 外觀（§ 13.2.1）', () => {
  it('每個設施都有一組外觀', () => {
    for (const f of FACILITIES) {
      expect(NPC_APPEARANCES[f], f).toBeDefined();
    }
    expect(Object.keys(NPC_APPEARANCES).sort()).toEqual([...FACILITIES].sort());
  });

  it.each(FACILITIES)('%s 的外觀通得過驗證', (facility) => {
    const a = NPC_APPEARANCES[facility];
    expect(isHairStyleId(a.hair)).toBe(true);
    expect(normalizeAppearance(a)).toEqual(a);
  });

  /** 與玩家共用同一條規則：眼珠在遊戲內只有 1～2 px，看不見等於沒有眼睛 */
  it.each(FACILITIES)('%s 的眼色在他的膚色上看得見', (facility) => {
    const a = NPC_APPEARANCES[facility];
    expect(contrastRatio(a.eyeColor, a.skin)).toBeGreaterThanOrEqual(MIN_EYE_CONTRAST);
  });

  /**
   * NPC 的顏色也要出自共用色票。自己另外配一組的話，
   * 調色盤改了 NPC 不會跟著改，久了就變成兩套配色。
   */
  it.each(FACILITIES)('%s 的顏色都出自共用色票', (facility) => {
    const a = NPC_APPEARANCES[facility];
    expect(SKIN_TONES as readonly string[]).toContain(a.skin);
    expect(PALETTE).toContain(a.hairColor);
    expect(PALETTE).toContain(a.eyeColor);
    expect(PALETTE).toContain(a.cloth);
  });

  it('衣色沒有兩個設施重複 —— 遠看就要分得出誰是誰', () => {
    const cloths = FACILITIES.map((f) => NPC_APPEARANCES[f].cloth);
    expect(new Set(cloths).size).toBe(FACILITIES.length);
  });

  /** 認人靠長相，長得一樣就沒有意義了 */
  it('沒有兩個設施長得一模一樣', () => {
    const keys = FACILITIES.map((f) => JSON.stringify(NPC_APPEARANCES[f]));
    expect(new Set(keys).size).toBe(FACILITIES.length);
  });

  it('髮型有足夠的分散度 —— 不是整排同一顆頭', () => {
    const hairs = new Set(FACILITIES.map((f) => NPC_APPEARANCES[f].hair));
    expect(hairs.size).toBeGreaterThanOrEqual(8);
  });

  it('沒登記的設施退回預設，不拋錯 —— 新設施忘了配外觀不該讓地圖畫不出來', () => {
    expect(() => getNpcAppearance('brand-new-shop')).not.toThrow();
    expect(getNpcAppearance('brand-new-shop')).toEqual(createDefaultAppearance());
  });

  it('回傳的外觀改了不會污染下一次 —— 每個呼叫拿到自己的物件', () => {
    const a = getNpcAppearance('unknown-a');
    a.tune.twin = { front: 30 };
    expect(getNpcAppearance('unknown-b').tune).toEqual({});
  });
});
