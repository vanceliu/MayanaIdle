import type { Zone, Region, Floor } from './area';

// ============================================================
// Zones
// ============================================================

export const ZONES: Zone[] = [
  {
    id: 'newbie-neutral',
    name: '新手中立區',
    faction: 'neutral',
    levelMin: 1,
    levelMax: 30,
    regions: ['dawn-plains', 'green-valley', 'wind-woods', 'misty-swamp', 'trial-highlands', 'trial-highlands-top', 'neutral-town'],
    connectedZones: ['ivory-tower-zone', 'grey-ridge'],
  },
  {
    id: 'ivory-tower-zone',
    name: '象牙塔',
    faction: 'neutral',
    levelMin: 30,
    levelMax: 45,
    regions: ['snow-field', 'snow-field-deep', 'ivory-tower'],
    connectedZones: ['newbie-neutral'],
  },
  {
    id: 'elsarth',
    name: '艾爾薩斯領地',
    faction: 'west',
    levelMin: 30,
    levelMax: 50,
    regions: ['demon-forest', 'misty-cave', 'elsarth-town'],
    connectedZones: ['grey-ridge'],
  },
  {
    id: 'varden',
    name: '瓦爾登領地',
    faction: 'east',
    levelMin: 30,
    levelMax: 50,
    regions: ['mirror-forest', 'underwater-prison', 'varden-town'],
    connectedZones: ['grey-ridge'],
  },
  {
    id: 'dragon-valley-zone',
    name: '龍之谷',
    faction: 'neutral',
    levelMin: 30,
    levelMax: 50,
    regions: ['dragon-valley-surface', 'dragon-valley'],
    connectedZones: ['grey-ridge'],
  },
  {
    id: 'grey-ridge',
    name: '灰脊山脈',
    faction: 'neutral',
    levelMin: 40,
    levelMax: 100,
    regions: ['ancient-battlefield', 'hundred-pillar-1-10f', 'hundred-pillar-11-20f', 'hundred-pillar-21-30f', 'hundred-pillar-31-40f', 'hundred-pillar-41-50f', 'hundred-pillar-51-60f', 'hundred-pillar-61-70f', 'hundred-pillar-71-80f', 'hundred-pillar-81-90f', 'hundred-pillar-91-100f', 'ancient-dungeon'],
    connectedZones: ['newbie-neutral', 'elsarth', 'varden', 'dragon-valley-zone'],
  },
];

// ============================================================
// Regions
// ============================================================

// --- 新手中立區 ---

const dawnPlains: Region = {
  id: 'dawn-plains',
  name: '曙光草原',
  type: 'field',
  levelMin: 1,
  levelMax: 5,
  zoneId: 'newbie-neutral',
  monsters: ['暴牙兔', '野牛', '史萊姆'],
};

const greenValley: Region = {
  id: 'green-valley',
  name: '翠綠谷地',
  type: 'field',
  levelMin: 6,
  levelMax: 10,
  zoneId: 'newbie-neutral',
  monsters: ['野狼', '妖魔', '哥布林'],
};

const windWoods: Region = {
  id: 'wind-woods',
  name: '風語林地',
  type: 'field',
  levelMin: 11,
  levelMax: 15,
  zoneId: 'newbie-neutral',
  monsters: ['森林蜘蛛', '樹精靈'],
};

const mistySwamp: Region = {
  id: 'misty-swamp',
  name: '迷霧沼澤',
  type: 'field',
  levelMin: 16,
  levelMax: 20,
  zoneId: 'newbie-neutral',
  monsters: ['毒蛇', '風之鷹', '沼澤蜥蜴'],
};

const trialHighlands: Region = {
  id: 'trial-highlands',
  name: '試煉高地',
  type: 'field',
  levelMin: 21,
  levelMax: 25,
  zoneId: 'newbie-neutral',
  monsters: ['石像鬼', '高地狼人', '風蝎', '高地獅鷲'],
};

const trialHighlandsTop: Region = {
  id: 'trial-highlands-top',
  name: '試煉高地頂部',
  type: 'field',
  levelMin: 26,
  levelMax: 30,
  zoneId: 'newbie-neutral',
  monsters: ['暴風鷹', '山賊', '山賊頭目', '岩石巨人', '試煉飛龍'],
};

const neutralTown: Region = {
  id: 'neutral-town',
  name: '薄暮村',
  type: 'town',
  levelMin: 1,
  levelMax: 99,
  zoneId: 'newbie-neutral',
};

// --- 象牙塔 ---

const snowField: Region = {
  id: 'snow-field',
  name: '雪原地帶',
  type: 'field',
  levelMin: 30,
  levelMax: 33,
  zoneId: 'ivory-tower-zone',
  monsters: ['凍骨哥布林', '冰霜蜘蛛', '雪狼', '冰晶蝙蝠'],
};

const snowFieldDeep: Region = {
  id: 'snow-field-deep',
  name: '雪原地帶深處',
  type: 'field',
  levelMin: 34,
  levelMax: 35,
  zoneId: 'ivory-tower-zone',
  monsters: ['雪人', '雪怪', '雪地之主'],
};

const ivoryTowerDungeon: Region = {
  id: 'ivory-tower',
  name: '象牙塔',
  type: 'dungeon',
  levelMin: 33,
  levelMax: 45,
  zoneId: 'ivory-tower-zone',
  floors: [
    { floor: 1, levelMin: 33, levelMax: 36, monsters: ['冰霜蜘蛛', '象牙巫師', '冰晶蝙蝠'], isBossFloor: false },
    { floor: 2, levelMin: 36, levelMax: 38, monsters: ['象牙巫師', '冰晶蝙蝠', '霜甲戰士'], isBossFloor: false },
    { floor: 3, levelMin: 38, levelMax: 40, monsters: ['霜甲戰士', '冰霜元素', '象牙魔導師'], isBossFloor: false },
    { floor: 4, levelMin: 40, levelMax: 42, monsters: ['冰霜元素', '象牙魔導師', '霜甲戰士'], isBossFloor: false },
    { floor: 5, levelMin: 42, levelMax: 45, monsters: ['冰霜元素', '象牙魔導師', '霜甲戰士', '象牙塔惡魔'], isBossFloor: true, bossName: '象牙塔惡魔' },
  ],
};

// --- 艾爾薩斯領地 ---

const demonForest: Region = {
  id: 'demon-forest',
  name: '妖魔森林',
  type: 'field',
  levelMin: 30,
  levelMax: 40,
  zoneId: 'elsarth',
  monsters: ['高等妖魔', '高等妖魔鬥士', '妖魔神射手', '巨人'],
};

const mistyCave: Region = {
  id: 'misty-cave',
  name: '朦朧洞窟',
  type: 'dungeon',
  levelMin: 40,
  levelMax: 50,
  zoneId: 'elsarth',
  floors: [
    { floor: 1, levelMin: 40, levelMax: 43, monsters: ['高等妖魔鬥士', '高等史萊姆', '高等蜥蜴'], isBossFloor: false },
    { floor: 2, levelMin: 43, levelMax: 46, monsters: ['高等史萊姆', '高等蜥蜴', '洞窟巨蟲'], isBossFloor: false },
    { floor: 3, levelMin: 46, levelMax: 50, monsters: ['洞窟巨蟲', '朦朧幻獸', '高等蜥蜴'], isBossFloor: true, bossName: '朦朧蛇魔' },
  ],
};

const elsarthTown: Region = {
  id: 'elsarth-town',
  name: '艾爾薩斯城鎮',
  type: 'town',
  levelMin: 1,
  levelMax: 99,
  zoneId: 'elsarth',
};

// --- 瓦爾登領地 ---

const mirrorForest: Region = {
  id: 'mirror-forest',
  name: '明鏡森林',
  type: 'field',
  levelMin: 30,
  levelMax: 40,
  zoneId: 'varden',
  monsters: ['鏡面精靈', '光影狐', '明鏡樹妖', '幻光獵蛾'],
};

const underwaterPrison: Region = {
  id: 'underwater-prison',
  name: '水下監獄',
  type: 'dungeon',
  levelMin: 40,
  levelMax: 50,
  zoneId: 'varden',
  floors: [
    { floor: 1, levelMin: 40, levelMax: 43, monsters: ['水牢守衛', '溺水亡靈', '深海藻獸'], isBossFloor: false },
    { floor: 2, levelMin: 43, levelMax: 45, monsters: ['溺水亡靈', '深海藻獸', '深海魚人'], isBossFloor: false },
    { floor: 3, levelMin: 45, levelMax: 48, monsters: ['深海魚人', '水牢守衛', '潮汐元素'], isBossFloor: false },
    { floor: 4, levelMin: 48, levelMax: 50, monsters: ['潮汐元素', '深海魚人', '溺水亡靈'], isBossFloor: true, bossName: '深海獄王' },
  ],
};

const vardenTown: Region = {
  id: 'varden-town',
  name: '瓦爾登城鎮',
  type: 'town',
  levelMin: 1,
  levelMax: 99,
  zoneId: 'varden',
};

// --- 龍之谷 ---

const dragonValleySurface: Region = {
  id: 'dragon-valley-surface',
  name: '龍之谷',
  type: 'field',
  levelMin: 30,
  levelMax: 40,
  zoneId: 'dragon-valley-zone',
  monsters: ['飛龍', '高階骷髏警衛', '高階骷髏神射手', '高階骷髏鬥士', '亞利安', '巨人'],
};

const dragonValleyDungeon: Region = {
  id: 'dragon-valley',
  name: '龍谷地間',
  type: 'dungeon',
  levelMin: 40,
  levelMax: 50,
  zoneId: 'dragon-valley-zone',
  floors: [
    { floor: 1, levelMin: 40, levelMax: 43, monsters: ['高階骷髏警衛', '高階骷髏神射手', '高階骷髏鬥士', '剝皮蜘蛛'], isBossFloor: false },
    { floor: 2, levelMin: 40, levelMax: 43, monsters: ['高階骷髏警衛', '高階骷髏神射手', '高階骷髏鬥士', '剝皮蜘蛛'], isBossFloor: false },
    { floor: 3, levelMin: 43, levelMax: 46, monsters: ['高階骷髏警衛', '高階骷髏神射手', '高階骷髏鬥士', '大莫蜘蛛'], isBossFloor: false },
    { floor: 4, levelMin: 43, levelMax: 46, monsters: ['高階骷髏警衛', '高階骷髏神射手', '高階骷髏鬥士', '大莫蜘蛛'], isBossFloor: false },
    { floor: 5, levelMin: 46, levelMax: 49, monsters: ['大莫蜘蛛', '死亡靈魂', '高階骷髏鬥士'], isBossFloor: false },
    { floor: 6, levelMin: 46, levelMax: 49, monsters: ['大莫蜘蛛', '死亡靈魂', '高階骷髏鬥士'], isBossFloor: false },
    { floor: 7, levelMin: 49, levelMax: 50, monsters: ['大莫蜘蛛', '死亡靈魂', '死亡靈魂守衛', '安塔巨龍'], isBossFloor: true, bossName: '安塔巨龍' },
  ],
};

// --- 灰脊山脈 ---

const ancientBattlefield: Region = {
  id: 'ancient-battlefield',
  name: '遠古戰場',
  type: 'field',
  levelMin: 40,
  levelMax: 45,
  zoneId: 'grey-ridge',
  monsters: ['戰場殭屍', '戰場骷髏兵', '戰場骷髏弓手', '亡魂騎士'],
};

/** 百柱塔十個區段在導覽上收成一個入口（region id 不變） */
const HUNDRED_PILLAR_GROUP = { id: 'hundred-pillar', name: '百柱塔' } as const;

const hundredPillar1_10: Region = {
  id: 'hundred-pillar-1-10f',
  name: '百柱塔 1~10F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 45,
  levelMax: 52,
  zoneId: 'grey-ridge',
  monsters: ['百柱蜘蛛', '百柱祕密', '百柱妖女', '百柱奇美拉', '百柱幻影', '毒之皇女'],
};

const hundredPillar11_20: Region = {
  id: 'hundred-pillar-11-20f',
  name: '百柱塔 11~20F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 45,
  levelMax: 52,
  zoneId: 'grey-ridge',
  entryScrollName: '百柱塔 11F 通行卷軸',
  monsters: ['高階夢魘', '高階哥布林', '高階地靈', '高階爬蟲', '高階哥布林弓手', '高階哥布林戰士', '高階地靈之主', '哥布林之王'],
};

const hundredPillar21_30: Region = {
  id: 'hundred-pillar-21-30f',
  name: '百柱塔 21~30F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 45,
  levelMax: 52,
  zoneId: 'grey-ridge',
  entryScrollName: '百柱塔 21F 通行卷軸',
  monsters: ['暗影潛伏者', '暗影蝙蝠', '暗影刺客', '暗影巫師', '暗影獵犬', '暗影吸血鬼'],
};

const hundredPillar31_40: Region = {
  id: 'hundred-pillar-31-40f',
  name: '百柱塔 31~40F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 52,
  levelMax: 57,
  zoneId: 'grey-ridge',
  entryScrollName: '百柱塔 31F 通行卷軸',
  monsters: ['不死骷髏兵', '不死腐屍', '不死幽魂', '不死死靈騎士', '不死巫妖', '不死殭屍王'],
};

const hundredPillar41_50: Region = {
  id: 'hundred-pillar-41-50f',
  name: '百柱塔 41~50F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 52,
  levelMax: 57,
  zoneId: 'grey-ridge',
  entryScrollName: '百柱塔 41F 通行卷軸',
  monsters: ['古代幼龍', '古代小型飛龍', '古代龍人', '古代雙頭龍', '古代龍騎兵', '龍王約特勒'],
};

const hundredPillar51_60: Region = {
  id: 'hundred-pillar-51-60f',
  name: '百柱塔 51~60F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 52,
  levelMax: 57,
  zoneId: 'grey-ridge',
  entryScrollName: '百柱塔 51F 通行卷軸',
  monsters: ['怨念幽靈', '哭嚎女妖', '鬼魂遊蕩者', '冥界使者', '冥王哈馬斯'],
};

const hundredPillar61_70: Region = {
  id: 'hundred-pillar-61-70f',
  name: '百柱塔 61~70F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 57,
  levelMax: 60,
  zoneId: 'grey-ridge',
  entryScrollName: '百柱塔 61F 通行卷軸',
  monsters: ['霜凍巨人', '霜凍狼', '冰晶元素', '霜凍女巫', '霜凍伊莉絲'],
};

const hundredPillar71_80: Region = {
  id: 'hundred-pillar-71-80f',
  name: '百柱塔 71~80F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 57,
  levelMax: 60,
  zoneId: 'grey-ridge',
  entryScrollName: '百柱塔 71F 通行卷軸',
  monsters: ['熔岩巨獸', '火焰蜥蜴', '岩漿元素', '熔岩守衛', '熔岩伊弗利特'],
};

const hundredPillar81_90: Region = {
  id: 'hundred-pillar-81-90f',
  name: '百柱塔 81~90F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 57,
  levelMax: 60,
  zoneId: 'grey-ridge',
  entryScrollName: '百柱塔 81F 通行卷軸',
  monsters: ['殘影毒之皇女', '殘影哥布林之王', '殘影暗影吸血鬼', '殘影不死殭屍王', '殘影龍王約特勒', '殘影冥王哈瑪斯', '殘影霜凍伊莉絲', '殘影熔岩伊弗利特', '守護者之主'],
};

const hundredPillar91_100: Region = {
  id: 'hundred-pillar-91-100f',
  name: '百柱塔 91~100F',
  type: 'dungeon',
  group: HUNDRED_PILLAR_GROUP,
  levelMin: 60,
  levelMax: 60,
  zoneId: 'grey-ridge',
  entryScrollName: '百柱塔 91F 通行卷軸',
  monsters: ['精靈王衛兵', '死之信徒', '精靈王射手', '精靈王魔導士', '死之執行者', '百柱死神'],
};

const ancientDungeon: Region = {
  id: 'ancient-dungeon',
  name: '遠古地監',
  type: 'dungeon',
  levelMin: 45,
  levelMax: 60,
  zoneId: 'grey-ridge',
  floors: [
    { floor: 1, levelMin: 45, levelMax: 50, monsters: ['遠古囚犯', '遠古弓箭手'], isBossFloor: false },
    { floor: 2, levelMin: 45, levelMax: 50, monsters: ['遠古囚犯', '遠古弓箭手'], isBossFloor: false },
    { floor: 3, levelMin: 45, levelMax: 50, monsters: ['遠古囚犯', '遠古弓箭手'], isBossFloor: false },
    { floor: 4, levelMin: 50, levelMax: 55, monsters: ['封印殭屍', '遠古囚犯', '遠古弓箭手'], isBossFloor: false },
    { floor: 5, levelMin: 50, levelMax: 55, monsters: ['封印殭屍', '遠古囚犯', '遠古弓箭手'], isBossFloor: false },
    { floor: 6, levelMin: 50, levelMax: 55, monsters: ['封印殭屍', '遠古囚犯', '遠古弓箭手'], isBossFloor: false },
    { floor: 7, levelMin: 55, levelMax: 60, monsters: ['遠古凶獸', '遠古戰士', '遠古神射手', '遠古食人妖精'], isBossFloor: false },
    { floor: 8, levelMin: 55, levelMax: 60, monsters: ['遠古凶獸', '遠古戰士', '遠古神射手', '遠古食人妖精'], isBossFloor: false },
    { floor: 9, levelMin: 55, levelMax: 60, monsters: ['遠古凶獸', '遠古戰士', '遠古神射手', '遠古食人妖精', '遠古騎士'], isBossFloor: true, bossName: '遠古騎士' },
  ],
};

// ============================================================
// Aggregated exports
// ============================================================

export const REGIONS: Region[] = [
  // 新手中立區
  dawnPlains,
  greenValley,
  windWoods,
  mistySwamp,
  trialHighlands,
  trialHighlandsTop,
  neutralTown,
  // 象牙塔
  snowField,
  snowFieldDeep,
  ivoryTowerDungeon,
  // 艾爾薩斯
  demonForest,
  mistyCave,
  elsarthTown,
  // 瓦爾登
  mirrorForest,
  underwaterPrison,
  vardenTown,
  // 龍之谷
  dragonValleySurface,
  dragonValleyDungeon,
  // 灰脊山脈
  ancientBattlefield,
  hundredPillar1_10,
  hundredPillar11_20,
  hundredPillar21_30,
  hundredPillar31_40,
  hundredPillar41_50,
  hundredPillar51_60,
  hundredPillar61_70,
  hundredPillar71_80,
  hundredPillar81_90,
  hundredPillar91_100,
  ancientDungeon,
];

// ============================================================
// Lookup helpers
// ============================================================

export function getZone(zoneId: string): Zone | undefined {
  return ZONES.find(z => z.id === zoneId);
}

export function getRegion(regionId: string): Region | undefined {
  return REGIONS.find(r => r.id === regionId);
}

export function getRegionsByZone(zoneId: string): Region[] {
  return REGIONS.filter(r => r.zoneId === zoneId);
}

export function getFloor(regionId: string, floorNum: number): Floor | undefined {
  const region = getRegion(regionId);
  if (!region?.floors) return undefined;
  return region.floors.find(f => f.floor === floorNum);
}

export function getMonstersAtLocation(regionId: string, floor: number | null): string[] {
  const region = getRegion(regionId);
  if (!region) return [];

  if (region.type === 'dungeon' && region.floors && floor != null) {
    const f = region.floors.find(fl => fl.floor === floor);
    return f?.monsters ?? [];
  }

  return region.monsters ?? [];
}

export function getScrollSegmentForFloor(floor: number, segmentSize: number): number {
  return Math.floor((floor - 1) / segmentSize) * segmentSize + 1;
}

export function getRequiredScrollName(regionId: string, targetFloor: number): string | null {
  const region = getRegion(regionId);
  if (!region?.requiresScroll || !region.scrollSegmentSize) return null;
  if (targetFloor <= region.scrollSegmentSize) return null;
  const segment = getScrollSegmentForFloor(targetFloor, region.scrollSegmentSize);
  return `${region.name} ${segment}F 通行卷軸`;
}

export function getNearestTown(currentRegionId: string): Region {
  const currentRegion = getRegion(currentRegionId);
  if (currentRegion) {
    const sameZoneTown = REGIONS.find(r => r.zoneId === currentRegion.zoneId && r.type === 'town');
    if (sameZoneTown) return sameZoneTown;
  }
  return REGIONS.find(r => r.id === 'neutral-town')!;
}
