export type RegionType = 'field' | 'dungeon' | 'town';

export interface Floor {
  floor: number;
  levelMin: number;
  levelMax: number;
  monsters: string[];
  isBossFloor: boolean;
  bossName?: string;
}

export interface Region {
  id: string;
  name: string;
  type: RegionType;
  levelMin: number;
  levelMax: number;
  zoneId: string;
  monsters?: string[];
  floors?: Floor[];
  /** 百柱塔需要卷軸才能進入下一區段 */
  requiresScroll?: boolean;
  scrollSegmentSize?: number;
  /** 進入此區域需要消耗的卷軸名稱（獨立 region 用） */
  entryScrollName?: string;
}

export interface Zone {
  id: string;
  name: string;
  faction: 'neutral' | 'west' | 'east';
  levelMin: number;
  levelMax: number;
  regions: string[];
  connectedZones: string[];
}

export interface MapLocation {
  zoneId: string;
  regionId: string;
  floor: number | null;
}
