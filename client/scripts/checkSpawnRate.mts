/**
 * 量測怪物生成的失敗率。
 *
 * 引擎的生成流程（`mapMonsterStore`）：隨機挑一個**可生成格**，要求距玩家 ≥5 格，
 * 最多試 20 次，全失敗就放棄本次生成。可生成格太少、或大多集中在玩家附近時，
 * 生成頻率就會低於 Pressure 公式的預期。
 *
 * 這裡取「玩家站在最不利位置」的最壞情況：
 *   p = 距玩家 <5 的可生成格 ÷ 全部可生成格
 *   單次生成失敗率 = p^20
 *
 * 用法：npx vite-node scripts/checkSpawnRate.mts
 */
import { readFileSync, readdirSync } from 'node:fs';
import type { MapData } from '../src/models/mapControl';
import { isSpawnableTile, isWalkableTile } from '../src/models/mapControl';

const MIN_SPAWN_DISTANCE = 5;
const ATTEMPTS = 20;
const rows: { id: string; spawnable: number; worst: number; fail: number }[] = [];

for (const file of readdirSync('src/data/maps').filter(f => f.endsWith('.json')).sort()) {
  const map = JSON.parse(readFileSync(`src/data/maps/${file}`, 'utf8')) as MapData;
  const spawnable: { x: number; y: number }[] = [];
  const stands: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isSpawnableTile(map, { x, y })) spawnable.push({ x, y });
      if (isWalkableTile(map, { x, y })) stands.push({ x, y });
    }
  }
  // 玩家可能站的每一格都試一遍，取最不利的
  let worst = 0;
  for (const p of stands) {
    let near = 0;
    for (const s of spawnable) {
      if (Math.hypot(s.x - p.x, s.y - p.y) < MIN_SPAWN_DISTANCE) near++;
    }
    worst = Math.max(worst, near / spawnable.length);
  }
  rows.push({ id: map.id, spawnable: spawnable.length, worst, fail: worst ** ATTEMPTS });
}

rows.sort((a, b) => b.fail - a.fail);
console.log('最壞情況（玩家站在最不利的位置）：');
for (const r of rows.slice(0, 8)) {
  console.log(`  ${r.id.padEnd(24)} 可生成格 ${String(r.spawnable).padStart(4)}`
    + `　附近佔比 ${(r.worst * 100).toFixed(1)}%　單次生成失敗率 ${(r.fail * 100).toFixed(4)}%`);
}
const bad = rows.filter(r => r.fail > 0.01);
console.log(bad.length ? `\n⚠ ${bad.length} 張的失敗率超過 1%` : '\n全部 50 張的最壞失敗率都低於 1%');
