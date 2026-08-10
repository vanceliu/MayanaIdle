/**
 * `training` 是試驗場（`50-training-ground.md`）。它不屬於任何 Zone，
 * 因此不會出現在地圖導覽選單裡 —— 唯一入口是城鎮 NPC。
 */
export type RegionType = 'field' | 'dungeon' | 'town' | 'training';

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
  /** 進入此區域需要消耗的卷軸 `ITEM_DEFINITIONS` id（獨立 region 用）。名稱由 id 反查，不存名稱 */
  entryScrollItemId?: number;
  /**
   * 導覽分組。同一組的 region 在地圖選單裡先收成一個入口，點進去才列出各段。
   * 這**只影響導覽層級**——region id 不變，掉落／怪物／任務／存檔一律照舊。
   * 百柱塔十個區段就是靠這個收成一個入口。
   */
  group?: { id: string; name: string };
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
