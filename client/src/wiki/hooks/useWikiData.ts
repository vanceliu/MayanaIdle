import { MONSTER_SEEDS, EQUIPMENT_SEEDS, DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS, ITEM_DEFINITIONS } from '../../db/seed';
import { ZONES, REGIONS } from '../../models/mapData';
import { DROP_ROLL_MAX } from '../../systems/drops';
import type { MonsterTemplate } from '../../models/monster';
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

export function useWeaponList(): EquipmentTemplate[] {
  return EQUIPMENT_SEEDS.filter(e => e.type !== 'armor');
}

export function useArmorList(): EquipmentTemplate[] {
  return EQUIPMENT_SEEDS.filter(e => e.type === 'armor');
}

export function useEquipmentByName(name: string): EquipmentTemplate | undefined {
  return EQUIPMENT_SEEDS.find(e => e.name === name);
}

export function useEquipmentById(id: number): EquipmentTemplate | undefined {
  return EQUIPMENT_SEEDS.find(e => e.id === id);
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

export function getDropItemName(drop: { itemTemplateId?: number; equipmentTemplateId?: number; equipmentPool?: string; craftTier?: string; acquireType?: string; shopTier?: string; itemType: string }): string {
  if (drop.itemType === 'gold') return '金幣';
  if (drop.itemType === 'equipment' && drop.equipmentTemplateId) {
    const equip = EQUIPMENT_SEEDS.find(e => e.id === drop.equipmentTemplateId);
    return equip?.name ?? '未知裝備';
  }
  if (drop.itemType === 'equipment' && drop.equipmentPool) {
    if (drop.acquireType === 'shop' && drop.shopTier) {
      const tierLabel = drop.shopTier === 'high' ? '高階' : drop.shopTier === 'mid' ? '中階' : '低階';
      const poolLabel = drop.equipmentPool === 'weapon' ? '武器' : drop.equipmentPool === 'armor' ? '防具' : '裝備';
      return `${tierLabel}${poolLabel}（隨機）`;
    }
    const tierLabel = drop.craftTier === 'top' ? '頂級' : drop.craftTier === 'mid' ? '高級進階' : '高級入門';
    const poolLabel = drop.equipmentPool === 'weapon' ? '武器' : '防具';
    return `${tierLabel}${poolLabel}（隨機）`;
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
  return `${percent.toFixed(2)}%`;
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
