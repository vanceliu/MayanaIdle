import { describe, it, expect } from 'vitest';
import { DROP_TABLE_SEEDS } from '../seed';
import { getItemById } from '../../models/items';
import { DROP_ROLL_MAX } from '../../systems/drops';

/**
 * 龍谷地間與遠古地監的產出分工（`09-dungeon.md` § 9.10）。
 *
 * 兩座副本在 Lv.45~50 重疊，靠產出種類區隔而非強弱：龍谷地間產金幣與素材，
 * 遠古地監產 T6 裝備。分工只寫在 seed 裡，改掉率不會報錯，只會靜默讓兩張圖再度重疊。
 */

/** 重疊等級帶：龍谷地間 5~6F（Lv.46~49）對遠古地監 1~3F（Lv.45~50） */
const OVERLAP_DRAGON = ['dragon-valley-5f', 'dragon-valley-6f'];
const OVERLAP_ANCIENT = ['ancient-dungeon-1f', 'ancient-dungeon-2f', 'ancient-dungeon-3f'];

const TARGET_RATIO = 1.5;
const RATIO_TOLERANCE = 0.05;

const DRAGON_FLOORS = ['1f', '2f', '3f', '4f', '5f', '6f'].map(f => `dragon-valley-${f}`);
const ANCIENT_FLOORS = ['1f', '2f', '3f', '4f', '5f', '6f', '7f', '8f'].map(f => `ancient-dungeon-${f}`);

/** 單位擊殺期望收益 = 金幣期望值 + material 類道具的期望賣價 */
function yieldPerKill(area: string): number {
  return DROP_TABLE_SEEDS.filter(d => d.area === area).reduce((sum, d) => {
    if (d.itemType === 'gold') return sum + ((d.minAmount ?? 0) + (d.maxAmount ?? 0)) / 2;
    if (d.itemType !== 'item' || d.itemTemplateId === undefined) return sum;
    const item = getItemById(d.itemTemplateId);
    if (item?.category !== 'material') return sum;
    return sum + (d.dropValue / DROP_ROLL_MAX) * (item.sellPrice ?? 0);
  }, 0);
}

const average = (areas: string[]) => areas.reduce((sum, a) => sum + yieldPerKill(a), 0) / areas.length;

const equipmentTiers = (areas: string[]) =>
  new Set(DROP_TABLE_SEEDS.filter(d => areas.includes(d.area) && d.itemType === 'equipment').map(d => d.tier));

describe('龍谷地間與遠古地監的產出分工', () => {
  it('重疊等級帶的單位擊殺收益比值為 1.5 倍', () => {
    const ratio = average(OVERLAP_DRAGON) / average(OVERLAP_ANCIENT);
    expect(ratio).toBeGreaterThan(TARGET_RATIO - RATIO_TOLERANCE);
    expect(ratio).toBeLessThan(TARGET_RATIO + RATIO_TOLERANCE);
  });

  it('重疊帶內龍谷地間任一層的收益都高於遠古地監任一層', () => {
    for (const dragon of OVERLAP_DRAGON) {
      for (const ancient of OVERLAP_ANCIENT) {
        expect(yieldPerKill(dragon), `${dragon} 未高於 ${ancient}`).toBeGreaterThan(yieldPerKill(ancient));
      }
    }
  });

  it('裝備階級相反：龍谷地間只掉 T5，遠古地監只掉 T6', () => {
    expect([...equipmentTiers(DRAGON_FLOORS)]).toEqual([5]);
    expect([...equipmentTiers(ANCIENT_FLOORS)]).toEqual([6]);
  });
});
