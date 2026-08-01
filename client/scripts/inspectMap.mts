/**
 * 手繪地圖的除錯輔助：把 mapDesignRules 的違規逐格畫回 ASCII 上。
 * 用法：npx vite-node scripts/inspectMap.mts <mapId>
 */
import { MAP_DESIGN_PROFILES, reviewMapDesign, validateMapSafety } from '../src/models/mapDesignRules';
import { validateMapData } from '../src/models/mapDataControl';
import { readFileSync } from 'node:fs';
import type { MapData } from '../src/models/mapControl';

const id = process.argv[2];
const map = JSON.parse(readFileSync(`src/data/maps/${id}.json`, 'utf8')) as MapData;

const GLYPH: Record<number, string> = { 0: '.', 1: '#', 3: 'W', 4: 'd', 10: 'T', 11: 'R', 12: 'P', 13: '~', 14: 'L', 15: 'C', 16: 'g', 17: 's', 18: 'c' };
// 載入驗證要先跑：spawnPoint 必須落在「可生成格」(Ground)，
// 鋪成地毯／裝飾雖然可通行但不可生成，遊戲會直接拒絕載入這張圖。
let loadError = '';
try {
  validateMapData(map);
} catch (e) {
  loadError = (e as Error).message;
}
const violations = validateMapSafety(map);
const marks = new Map<string, string>();
const MARK: Record<string, string> = {
  'dead-ends': '!', 'corridor-width': 'n', 'spawn-clearance': 'x',
  'spawn-nearby-walkable': 'x', 'low-obstacle-bypass': 'b', 'detour-distance': 'D',
};
for (const v of violations) {
  for (const p of v.positions ?? []) marks.set(`${p.x},${p.y}`, MARK[v.rule] ?? '?');
}

console.log(`${map.name} (${id})  ${map.width}x${map.height}  spawn ${map.spawnPoint.x},${map.spawnPoint.y}`);
for (let y = 0; y < map.height; y++) {
  let line = '';
  for (let x = 0; x < map.width; x++) {
    line += marks.get(`${x},${y}`)
      ?? (x === map.spawnPoint.x && y === map.spawnPoint.y ? '@' : GLYPH[map.tiles[y][x]] ?? '?');
  }
  console.log(String(y).padStart(2) + ' ' + line);
}
const guidance = reviewMapDesign(map, MAP_DESIGN_PROFILES[id]);
console.log('載入驗證：' + (loadError ? `✗ ${loadError}` : '通過'));
console.log('安全檢查：' + (violations.length ? '\n' + violations.map(v => `  [${v.rule}] ${v.message}`).join('\n') : '通過'));
console.log('設計指引：' + (guidance.length ? '\n' + guidance.map(v => `  [${v.rule}] ${v.message}`).join('\n') : '通過'));
console.log('標記：! 死路  n 窄道  x 出生點淨空  b 低障礙繞行  D 繞路');
