/**
 * 把 `monsterSeeds.ts` 的 exp 欄同步進 `docs/design/28-monster-stats.md` 的素質表。
 *
 * 與 `generateArmorDocs.mts` 同原則：**seed 是唯一真實來源**，文件只是可讀的檢視。
 * 這裡只改經驗值欄，其餘欄位與敘述段落原樣保留 —— 素質表以外的章節是手寫規格。
 *
 * 文件的怪物名會帶樓層後綴（如「冰霜蜘蛛（1F）」）與 Boss 標記（如「**遠古騎士（王）**」），
 * 比對時一律剝掉後綴與粗體，以（基礎名, 等級）為鍵。
 *
 * 用法：cd client && npx vite-node scripts/syncMonsterExpDocs.mts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';

const DOC = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/design/28-monster-stats.md');
const WRITE = process.argv.includes('--write');

const STAT_ROW = /^\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*([\d,]+)\s*\|\s*([\d~]+)\s*\|\s*(\d+)\s*\|\s*([\d,]+)\s*\|$/;
const baseName = (cell: string) => cell.replace(/\*\*/g, '').replace(/（[^）]*）\s*$/, '').trim();

const expByKey = new Map<string, number>();
for (const m of MONSTER_SEEDS) expByKey.set(`${m.name}|${m.level}`, m.exp);

let matched = 0;
let changed = 0;
const missing: string[] = [];

const out = readFileSync(DOC, 'utf8').split('\n').map(line => {
  const m = line.match(STAT_ROW);
  if (!m || m[1] === '怪物等級') return line; // § 28.1 的公式對照表欄數相同，跳過
  const key = `${baseName(m[1])}|${m[2]}`;
  const exp = expByKey.get(key);
  if (exp === undefined) {
    missing.push(key);
    return line;
  }
  matched++;
  const next = exp.toLocaleString('en-US');
  if (next === m[6]) return line;
  changed++;
  return `| ${m[1]} | ${m[2]} | ${m[3]} | ${m[4]} | ${m[5]} | ${next} |`;
}).join('\n');

console.log(`matched=${matched} changed=${changed} missing=${missing.length}`);
if (missing.length) console.log(missing.join('\n'));
if (WRITE) {
  writeFileSync(DOC, out);
  console.log('written');
}
