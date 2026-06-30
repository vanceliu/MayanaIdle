import { MONSTER_SEEDS, EQUIPMENT_SEEDS, DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from '../../db/seed';
import { ZONES, REGIONS } from '../../models/mapData';
import { DROP_ROLL_MAX } from '../../systems/drops';
import type { MonsterTemplate } from '../../models/monster';
import type { EquipmentTemplate } from '../../models/equipment';
import type { DropTableEntry, BossDropTableEntry } from '../../db/database';
import type { Zone, Region } from '../../models/area';

type MonsterSeed = Omit<MonsterTemplate, 'id'>;
type EquipmentSeed = Omit<EquipmentTemplate, 'id'>;
type DropSeed = Omit<DropTableEntry, 'id'>;
type BossDropSeed = Omit<BossDropTableEntry, 'id'>;

export function useMonsterList(): MonsterSeed[] {
  return MONSTER_SEEDS;
}

export function useMonstersByArea(area: string): MonsterSeed[] {
  return MONSTER_SEEDS.filter(m => m.area === area || m.area.match(new RegExp(`^${area}-\\d`)));
}

export function useWeaponList(): EquipmentSeed[] {
  return EQUIPMENT_SEEDS.filter(e => e.type !== 'armor');
}

export function useArmorList(): EquipmentSeed[] {
  return EQUIPMENT_SEEDS.filter(e => e.type === 'armor');
}

export function useEquipmentByName(name: string): EquipmentSeed | undefined {
  return EQUIPMENT_SEEDS.find(e => e.name === name);
}

export function useDropTableByArea(area: string): DropSeed[] {
  return DROP_TABLE_SEEDS.filter(d => d.area === area || d.area.startsWith(`${area}-`));
}

export function useBossDropTableByName(bossName: string): BossDropSeed[] {
  return BOSS_DROP_TABLE_SEEDS.filter(d => d.bossName === bossName);
}

export function useDropSourceForItem(itemName: string): DropSeed[] {
  return DROP_TABLE_SEEDS.filter(d => d.itemName === itemName);
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
