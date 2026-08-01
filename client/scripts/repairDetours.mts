/**
 * 自動打通「兩格之隔卻要繞十幾格」的迷宮牆。
 *
 * 迷宮牆線很容易在轉角處把相鄰的兩塊區域切開，怪物追蹤上限只有 15 格，
 * 被逼著繞遠路的紅點會在半路消失。這裡沿著兩點連線找一格牆打通，反覆到乾淨為止。
 *
 * 用法：npx vite-node scripts/repairDetours.mts <mapId> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { MapData } from '../src/models/mapControl';
import { TileType } from '../src/models/mapControl';
import { checkDetourDistance } from '../src/models/mapDesignRules';

const WALKABLE = new Set<number>([TileType.Ground, TileType.Decoration, TileType.Grass, TileType.Sand, TileType.Carpet]);

for (const id of process.argv.slice(2)) {
  const path = `src/data/maps/${id}.json`;
  const map = JSON.parse(readFileSync(path, 'utf8')) as MapData;
  let punched = 0;

  for (let round = 0; round < 60; round++) {
    const [violation] = checkDetourDistance(map);
    if (!violation?.positions) break;
    const [a, b] = violation.positions;

    // 沿兩點連線取樣，打通第一格擋路的障礙（外圈邊界不動）
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2;
    let done = false;
    for (let i = 1; i < steps && !done; i++) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / steps);
      const y = Math.round(a.y + ((b.y - a.y) * i) / steps);
      if (x <= 0 || y <= 0 || x >= map.width - 1 || y >= map.height - 1) continue;
      if (WALKABLE.has(map.tiles[y][x])) continue;
      map.tiles[y][x] = TileType.Ground;
      punched++; done = true;
    }
    if (!done) {
      // 連線上沒有可打通的格子時，改清掉終點周圍的障礙
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = b.x + dx, y = b.y + dy;
        if (x <= 0 || y <= 0 || x >= map.width - 1 || y >= map.height - 1) continue;
        if (WALKABLE.has(map.tiles[y][x])) continue;
        map.tiles[y][x] = TileType.Ground; punched++; done = true; break;
      }
    }
    if (!done) break;
  }

  writeFileSync(path, `${JSON.stringify(map, null, 2)}\n`);
  const left = checkDetourDistance(map).length;
  console.log(`${id.padEnd(22)} 打通 ${punched} 格，剩餘繞路違規 ${left}`);
}
