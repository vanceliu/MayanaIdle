/** 製作材料來源區域（`06-equipment-acquire.md` § 6A.3）。陣列順序＝配方輪替順序，鄰區＝下一個區域 */
export interface CraftRegion {
  name: string;
  areas: string[];
}

const floors = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => `${prefix}-${from + k}f`);

export const CRAFT_SOURCE_REGIONS: Record<number, CraftRegion[]> = {
  4: [
    { name: '試煉高地', areas: ['trial-highlands', 'trial-highlands-top'] },
    { name: '雪原地帶', areas: ['snow-field', 'snow-field-deep'] },
    { name: '象牙塔 1~4F', areas: floors('ivory-tower', 1, 4) },
    { name: '艾爾薩斯領地', areas: ['demon-forest', 'rotleaf-path', 'demon-altar'] },
    { name: '瓦爾登領地', areas: ['mirror-forest', 'glimmer-shore', 'shattered-mirror'] },
    { name: '龍之谷外圍', areas: ['dragon-valley-outskirts'] },
    { name: '龍之谷地表', areas: ['dragon-valley-surface'] },
  ],
  5: [
    { name: '朦朧洞窟', areas: floors('misty-cave', 1, 3) },
    { name: '水下監獄', areas: floors('underwater-prison', 1, 4) },
    { name: '遠古戰場', areas: ['ancient-battlefield'] },
    { name: '遠古地監 1~5F', areas: floors('ancient-dungeon', 1, 5) },
    { name: '龍谷地監 1~7F', areas: floors('dragon-valley', 1, 7) },
  ],
  6: [
    { name: '遠古地監 6~9F', areas: floors('ancient-dungeon', 6, 9) },
    { name: '百柱塔 1~30F', areas: ['hundred-pillar-1-10f', 'hundred-pillar-11-20f', 'hundred-pillar-21-30f'] },
    { name: '百柱塔 31~60F', areas: ['hundred-pillar-31-40f', 'hundred-pillar-41-50f', 'hundred-pillar-51-60f'] },
  ],
};

/** 每 every 份配方有 1 份的鄰區材料改取自補充區域 */
export const CRAFT_SUPPLEMENT_REGION: Record<number, { region: CraftRegion; every: number } | undefined> = {
  6: {
    region: {
      name: '百柱塔 61~100F',
      areas: ['hundred-pillar-61-70f', 'hundred-pillar-71-80f', 'hundred-pillar-81-90f', 'hundred-pillar-91-100f'],
    },
    every: 3,
  },
};
