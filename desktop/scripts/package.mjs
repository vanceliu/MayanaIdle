/**
 * 桌面版打包（`docs/RELEASE.md` § 3.2）。
 *
 * 版本號一律取自 `client/package.json` —— 執行檔、前端、桌面版是同一個版本
 * （連線時比對的就是它，見 § 97.2 版本協商）。`desktop/package.json` 的
 * `version` 只是 npm 的必填欄位，打包時被這裡蓋掉。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, '..');
const { version } = JSON.parse(readFileSync(join(desktopRoot, '..', 'client', 'package.json'), 'utf-8'));

const targets = process.argv.slice(2).filter(a => a.startsWith('--'));
const platform = targets.length > 0 ? targets : ['--mac'];

console.log(`打包版本 ${version}（取自 client/package.json）`);
const result = spawnSync(
  join(desktopRoot, 'node_modules', '.bin', 'electron-builder'),
  [...platform, `-c.extraMetadata.version=${version}`],
  { cwd: desktopRoot, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
