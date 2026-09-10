// 產生 `src/generated/mapsIndex.ts`：把 client 的地圖 JSON 以靜態 import 收進 server bundle
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mapsDir = join(here, '..', '..', 'client', 'src', 'data', 'maps');
const outDir = join(here, '..', 'src', 'generated');
const ids = readdirSync(mapsDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();

const lines = ['// 由 scripts/genMapsIndex.mjs 產生，勿手改', "import type { MapData } from '../../../client/src/models/mapControl';", ''];
ids.forEach((id, i) => lines.push(`import m${i} from '../../../client/src/data/maps/${id}.json';`));
lines.push('', 'export const MAPS: Record<string, MapData> = {');
ids.forEach((id, i) => lines.push(`  '${id}': m${i} as unknown as MapData,`));
lines.push('};', '');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'mapsIndex.ts'), lines.join('\n'));
console.log(`[gen:maps] ${ids.length} maps`);
