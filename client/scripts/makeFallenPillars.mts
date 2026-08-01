/**
 * 把部分直立石柱改成倒塌石柱。
 *
 * 倒柱橫躺跨兩格，所以要在既有石柱旁邊補一格。補的位置**必須不影響通道**
 * （§ 38.12 改動既有地圖的守則）：每補一格就重跑安全檢查與載入驗證，
 * 有任何一項退步就撤回，確保原本的格局完全不變。
 *
 * 用法：npx vite-node scripts/makeFallenPillars.mts <mapId> <想要的倒柱數> [...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { MapData } from '../src/models/mapControl';
import { TileType } from '../src/models/mapControl';
import { getFallenPillarAxis, validateMapSafety } from '../src/models/mapDesignRules';
import { validateMapData } from '../src/models/mapDataControl';

function healthy(map: MapData): boolean {
  try {
    validateMapData(map);
  } catch {
    return false;
  }
  return validateMapSafety(map).length === 0;
}

for (let i = 2; i < process.argv.length; i += 2) {
  const id = process.argv[i];
  const want = Number(process.argv[i + 1]);
  const path = `src/data/maps/${id}.json`;
  const map = JSON.parse(readFileSync(path, 'utf8')) as MapData;
  if (!healthy(map)) { console.log(`${id.padEnd(22)} 原本就不健康，跳過`); continue; }

  let made = 0;
  for (let y = 1; y < map.height - 1 && made < want; y++) {
    for (let x = 1; x < map.width - 1 && made < want; x++) {
      if (map.tiles[y][x] !== TileType.Pillar) continue;
      if (getFallenPillarAxis(map, x, y)) continue;             // 已經是倒柱
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx <= 0 || ny <= 0 || nx >= map.width - 1 || ny >= map.height - 1) continue;
        if (map.tiles[ny][nx] !== TileType.Ground) continue;    // 只躺在空地上
        map.tiles[ny][nx] = TileType.Pillar;
        // 補完必須真的成為一根倒柱，而且整張圖的安全檢查不能退步
        if (getFallenPillarAxis(map, x, y) && healthy(map)) { made++; break; }
        map.tiles[ny][nx] = TileType.Ground;
      }
    }
  }
  writeFileSync(path, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`${id.padEnd(22)} 做出 ${made} 根倒塌石柱`);
}
