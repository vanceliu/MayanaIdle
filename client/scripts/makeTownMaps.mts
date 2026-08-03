/**
 * 產生三張城鎮地圖（§ 38.10、§ 99.6）。
 *
 * 城鎮不是野外：沒有怪物、不套用 `validateMapSafety` 的密度／叢聚規範，
 * 版面訴求是「一眼看得出設施在哪、走過去很快」。因此用固定佈局而不是手繪隨機分佈：
 *
 *   - 外圍一圈邊界（載入驗證要求）
 *   - 中央十字大街（裸地面，spawnPoint 落在街心）
 *   - 四個街區種房舍（wall），房舍前留一格給 NPC 站
 *   - 邊角放綠地與水井裝飾
 *
 * 跑法：npx vite-node scripts/makeTownMaps.mts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WIDTH = 30;
const HEIGHT = 20;

const GROUND = 0;
const BOUNDARY = 1;
const WALL = 3;
const DECORATION = 4;
const WATER = 13;
const GRASS = 16;

interface NpcSpec {
  facility: string;
  name: string;
  icon: string;
  x: number;
  y: number;
}

/** 房舍：左上角 (x,y) 與尺寸，NPC 站在房子正下方那一格 */
interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  facility: string;
  name: string;
  icon: string;
}

/**
 * 十一個設施沿著十字大街兩側排開。座標是手工排的，改動後務必重跑本腳本並讓
 * `mapDataControl` 的載入驗證通過（NPC 必須站在可通行且走得到的格子上）。
 */
const BUILDINGS: Building[] = [
  { x: 5, y: 4, w: 3, h: 2, facility: 'general-store', name: '雜貨店', icon: '🛒' },
  { x: 9, y: 4, w: 3, h: 2, facility: 'weapon-shop', name: '武器店', icon: '⚔️' },
  { x: 13, y: 4, w: 3, h: 2, facility: 'armor-shop', name: '防具店', icon: '🛡️' },
  { x: 17, y: 4, w: 3, h: 2, facility: 'blacksmith', name: '鐵匠鋪', icon: '🔨' },
  { x: 21, y: 4, w: 3, h: 2, facility: 'inn', name: '旅館', icon: '🏨' },
  { x: 5, y: 13, w: 3, h: 2, facility: 'storage', name: '倉庫', icon: '📦' },
  { x: 9, y: 13, w: 3, h: 2, facility: 'magic-academy', name: '魔法學院', icon: '📖' },
  { x: 13, y: 13, w: 3, h: 2, facility: 'class-guild', name: '職業工會', icon: '⚜️' },
  { x: 17, y: 13, w: 3, h: 2, facility: 'adventurer-guild', name: '冒險者工會', icon: '🏛️' },
  { x: 21, y: 13, w: 3, h: 2, facility: 'statistics-center', name: '統計中心', icon: '📊' },
];

/** 只有中立城（薄暮村）有新手指導員 */
const STARTER_NPC: NpcSpec = { facility: 'starter-npc', name: '新手指導員', icon: '🧭', x: 16, y: 9 };

function buildTown(id: string, name: string, withStarterNpc: boolean) {
  const tiles: number[][] = [];
  for (let y = 0; y < HEIGHT; y++) {
    const row: number[] = [];
    for (let x = 0; x < WIDTH; x++) {
      const isEdge = x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1;
      row.push(isEdge ? BOUNDARY : GROUND);
    }
    tiles.push(row);
  }

  // 綠地：城區外圍的空地（可走、不生怪，純視覺分區）
  for (let y = 2; y <= 17; y++) {
    for (const x of [1, 2, 27, 28]) tiles[y][x] = GRASS;
  }

  // 廣場水井（不可通行，繞得過去）。放在中線左側，不擋出生點與主要動線。
  tiles[9][11] = WATER;
  tiles[10][11] = WATER;
  tiles[9][12] = WATER;
  tiles[10][12] = WATER;

  const npcs: NpcSpec[] = [];
  for (const b of BUILDINGS) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) tiles[y][x] = WALL;
    }
    // NPC 一律站在房舍「下方」那一格：等距投影下 y 較大的物件畫在前面，
    // 站在房子上方會被自己的房子蓋掉名牌。
    const npcY = b.y + b.h;
    const npcX = b.x + 1;
    tiles[npcY][npcX] = DECORATION; // 門口地磚，可走但不生怪
    npcs.push({ facility: b.facility, name: b.name, icon: b.icon, x: npcX, y: npcY });
  }

  if (withStarterNpc) {
    tiles[STARTER_NPC.y][STARTER_NPC.x] = DECORATION;
    npcs.push({ ...STARTER_NPC });
  }

  return {
    id,
    name,
    width: WIDTH,
    height: HEIGHT,
    theme: 'town' as const,
    spawnPoint: { x: 15, y: 10 },
    tiles,
    npcs,
  };
}

const TOWNS = [
  { id: 'neutral-town', name: '薄暮村', starter: true },
  { id: 'elsarth-town', name: '艾爾薩斯城鎮', starter: false },
  { id: 'varden-town', name: '瓦爾登城鎮', starter: false },
];

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'maps');
for (const town of TOWNS) {
  const map = buildTown(town.id, town.name, town.starter);
  writeFileSync(join(outDir, `${town.id}.json`), `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  console.log(`寫入 ${town.id}.json（${map.npcs.length} 個 NPC）`);
}
