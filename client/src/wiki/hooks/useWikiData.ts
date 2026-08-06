import { MONSTER_SEEDS, EQUIPMENT_SEEDS, DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS, ITEM_DEFINITIONS } from '../../db/seed';
import { ZONES, REGIONS } from '../../models/mapData';
import { DROP_ROLL_MAX } from '../../systems/drops';
import type { MonsterTemplate } from '../../models/monster';
import { isArmorEquipment } from '../../models/equipment';
import type { EquipmentTemplate } from '../../models/equipment';
import type { DropTableEntry, BossDropTableEntry } from '../../db/database';
import type { Zone, Region } from '../../models/area';
import { getItemById } from '../../models/items';

export function useMonsterList(): MonsterTemplate[] {
  return MONSTER_SEEDS;
}

export function useMonstersByArea(area: string): MonsterTemplate[] {
  return MONSTER_SEEDS.filter(m => m.area === area || m.area.match(new RegExp(`^${area}-\\d`)));
}

/** 盾牌／魔導書／臂甲分類是防具（`06-equipment.md` § 副手裝備），列在防具頁而非武器頁 */
export function useWeaponList(): EquipmentTemplate[] {
  return EQUIPMENT_SEEDS.filter(e => !isArmorEquipment(e.slot, e.type));
}

export function useArmorList(): EquipmentTemplate[] {
  return EQUIPMENT_SEEDS.filter(e => isArmorEquipment(e.slot, e.type));
}

/** 依裝備名稱決定 wiki 詳細頁路徑（副手防具走防具頁） */
export function getWikiEquipmentPath(name: string): string {
  const equip = EQUIPMENT_SEEDS.find(e => e.name === name);
  const base = equip && isArmorEquipment(equip.slot, equip.type) ? 'armor' : 'weapons';
  return `/wiki/${base}/${encodeURIComponent(name)}`;
}

export function useEquipmentByName(name: string): EquipmentTemplate | undefined {
  return EQUIPMENT_SEEDS.find(e => e.name === name);
}

/**
 * 純函式版本，供 render 中的條件分支使用 —— `useEquipmentById` 名字帶 `use`，
 * 放在 `&&` 或三元後面會被當成條件呼叫 hook。
 */
export function getEquipmentById(id: number): EquipmentTemplate | undefined {
  return EQUIPMENT_SEEDS.find(e => e.id === id);
}

export function useEquipmentById(id: number): EquipmentTemplate | undefined {
  return getEquipmentById(id);
}

export function useDropTableByArea(area: string): DropTableEntry[] {
  return DROP_TABLE_SEEDS.filter(d => d.area === area || d.area.match(new RegExp(`^${area}-\\d+f$`)));
}

export function useBossDropTableByName(bossName: string): BossDropTableEntry[] {
  return BOSS_DROP_TABLE_SEEDS.filter(d => d.bossName === bossName);
}

export function useDropSourceForItemId(itemTemplateId: number): DropTableEntry[] {
  return DROP_TABLE_SEEDS.filter(d => d.itemTemplateId === itemTemplateId);
}

export function useDropSourceForItem(itemName: string): DropTableEntry[] {
  const item = ITEM_DEFINITIONS.find(i => i.name === itemName);
  if (!item) return [];
  return DROP_TABLE_SEEDS.filter(d => d.itemTemplateId === item.id);
}

/** 掉落池的裝備池標籤（`06-equipment-acquire.md` § 6A.1：階級以「裝備Tier N」表示） */
export function getDropPoolLabel(tier: number | undefined, pool: string | undefined): string {
  const poolLabel = pool === 'weapon' ? '武器' : pool === 'armor' ? '防具' : '裝備';
  return tier == null ? `${poolLabel}（隨機）` : `裝備Tier ${tier} ${poolLabel}（隨機）`;
}

export function getDropItemName(drop: { itemTemplateId?: number; equipmentTemplateId?: number; equipmentPool?: string; tier?: number; acquireType?: string; itemType: string }): string {
  if (drop.itemType === 'gold') return '金幣';
  if (drop.itemType === 'equipment' && drop.equipmentTemplateId) {
    const equip = EQUIPMENT_SEEDS.find(e => e.id === drop.equipmentTemplateId);
    return equip?.name ?? '未知裝備';
  }
  if (drop.itemType === 'equipment' && drop.equipmentPool) {
    return getDropPoolLabel(drop.tier, drop.equipmentPool);
  }
  if (drop.itemTemplateId) {
    return getItemById(drop.itemTemplateId)?.name ?? '未知道具';
  }
  return '未知';
}

export function useZones(): Zone[] {
  return ZONES;
}

export function useRegions(): Region[] {
  return REGIONS;
}

export function useRegionById(id: string): Region | undefined {
  return REGIONS.find(r => r.id === id);
}

export function getDropRate(dropValue: number): string {
  const percent = (dropValue / DROP_ROLL_MAX) * 100;
  if (percent >= 100) return '100%';
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  // 極稀有掉落（T6 一般怪 0.001%、T7 Boss 0.001%）用 toFixed(2) 會顯示成 0.00%
  if (percent >= 0.01) return `${percent.toFixed(2)}%`;
  return `${percent.toFixed(3)}%`;
}

export function getAreaDisplayName(areaId: string): string {
  const region = REGIONS.find(r => r.id === areaId);
  if (region) return region.name;

  // Handle floor-based areas like "misty-cave-1f", "underwater-prison-2f"
  const floorMatch = areaId.match(/^(.+)-(\d+)f$/);
  if (floorMatch) {
    const baseRegion = REGIONS.find(r => r.id === floorMatch[1]);
    if (baseRegion) return `${baseRegion.name} ${floorMatch[2]}F`;
  }

  // Handle range-based areas like "hundred-pillar-1-10f"
  const rangeMatch = areaId.match(/^(.+)-(\d+-\d+)f$/);
  if (rangeMatch) {
    const baseRegion = REGIONS.find(r => r.id === rangeMatch[1]);
    if (baseRegion) return `${baseRegion.name} ${rangeMatch[2]}F`;
  }

  return areaId;
}
