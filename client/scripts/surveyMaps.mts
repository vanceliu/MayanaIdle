/**
 * 全地圖盤點：列出每張圖的安全違規數與設計指引違規，決定手繪的優先順序。
 * 用法：npx vite-node scripts/surveyMaps.mts
 */
import { readFileSync, readdirSync } from 'node:fs';
import type { MapData } from '../src/models/mapControl';
import { MAP_DESIGN_PROFILES, reviewMapDesign, validateMapSafety } from '../src/models/mapDesignRules';

const ids = readdirSync('src/data/maps').filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
let clean = 0;
for (const id of ids) {
  const map = JSON.parse(readFileSync(`src/data/maps/${id}.json`, 'utf8')) as MapData;
  const safety = validateMapSafety(map);
  const guidance = reviewMapDesign(map, MAP_DESIGN_PROFILES[id]);
  if (safety.length === 0 && guidance.length === 0) { clean++; continue; }
  const rules = [...safety.map(v => `安全:${v.rule}`), ...guidance.map(v => v.rule)];
  console.log(`${id.padEnd(26)} ${rules.join(', ')}`);
}
console.log(`\n${clean}/${ids.length} 張完全乾淨，${ids.length - clean} 張待手繪`);
