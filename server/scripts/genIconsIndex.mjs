// 產生 `src/generated/iconsIndex.ts`：把 client 的裝備／道具圖示 SVG 以字串收進 server bundle（管理介面角色查詢用）
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, '..', '..', 'client', 'src', 'assets', 'icons');
const outDir = join(here, '..', 'src', 'generated');
const icons = {};
for (const group of ['equipment', 'items']) {
  for (const file of readdirSync(join(iconsDir, group)).filter(f => f.endsWith('.svg')).sort()) {
    icons[`${group}/${file.slice(0, -4)}`] = readFileSync(join(iconsDir, group, file), 'utf-8').trim();
  }
}
const body = Object.entries(icons).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'iconsIndex.ts'),
  `// 由 scripts/genIconsIndex.mjs 產生，勿手改\nexport const ICONS: Record<string, string> = {\n${body}\n};\n`);
console.log(`[gen:icons] ${Object.keys(icons).length} icons`);
