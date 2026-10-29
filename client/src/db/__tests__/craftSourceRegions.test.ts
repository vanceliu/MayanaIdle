import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../seed/equipmentSeeds';
import { DROP_TABLE_SEEDS } from '../seed/dropSeeds';
import { CRAFT_SOURCE_REGIONS, CRAFT_SUPPLEMENT_REGION } from '../seed/craftSourceRegions';

const dropAreas = new Map<number, Set<string>>();
for (const d of DROP_TABLE_SEEDS) {
  if (d.itemTemplateId == null || !d.area) continue;
  if (!dropAreas.has(d.itemTemplateId)) dropAreas.set(d.itemTemplateId, new Set());
  dropAreas.get(d.itemTemplateId)!.add(d.area);
}
const dropsIn = (itemId: number, areas: string[]) => areas.some(a => dropAreas.get(itemId)?.has(a));

const recipesOf = (tier: number) =>
  EQUIPMENT_SEEDS.filter(e => e.acquireType === 'craft' && e.tier === tier && e.craftMaterials?.length);

describe('製作材料來源區域（06-equipment-acquire.md § 6A.3）', () => {
  for (const tier of [4, 5, 6]) {
    const regions = CRAFT_SOURCE_REGIONS[tier];
    const allowed = [
      ...regions.flatMap(r => r.areas),
      ...(CRAFT_SUPPLEMENT_REGION[tier]?.region.areas ?? []),
    ];

    it(`T${tier} 配方的每種材料都掉在該階的來源區域`, () => {
      const recipes = recipesOf(tier);
      expect(recipes.length).toBeGreaterThan(0);
      for (const e of recipes) {
        for (const m of e.craftMaterials!) {
          expect(dropsIn(m.itemId, allowed), `${e.name} #${m.itemId}`).toBe(true);
        }
      }
    });

    it(`T${tier} 配方除鄰區材料外集中在同一個來源區域`, () => {
      for (const e of recipesOf(tier)) {
        const main = e.craftMaterials!.slice(0, -1).map(m => m.itemId);
        const home = regions.find(r => main.every(id => dropsIn(id, r.areas)));
        expect(home, e.name).toBeDefined();
      }
    });

    it(`T${tier} 每個來源區域都有配方使用`, () => {
      const recipes = recipesOf(tier);
      for (const r of regions) {
        const used = recipes.some(e => e.craftMaterials!.slice(0, -1).every(m => dropsIn(m.itemId, r.areas)));
        expect(used, r.name).toBe(true);
      }
    });

    it(`T${tier} 配方的材料組合不重複`, () => {
      const signatures = recipesOf(tier).map(e => e.craftMaterials!.map(m => m.itemId).sort((a, b) => a - b).join(','));
      expect(new Set(signatures).size).toBe(signatures.length);
    });
  }
});
