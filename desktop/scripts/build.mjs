// esbuild：主行程與 preload 各打一份 CJS（Electron 的主行程走 CommonJS）
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// 主行程把 server 打進來，所以那份地圖索引（build 產物，不進版控）要先生出來
execFileSync(process.execPath, [join(here, '..', '..', 'server', 'scripts', 'genMapsIndex.mjs')], { stdio: 'inherit' });
const clientPkg = JSON.parse(readFileSync(join(here, '..', '..', 'client', 'package.json'), 'utf-8'));

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  logLevel: 'info',
  // Electron 由執行檔提供，不可打進 bundle
  external: ['electron'],
  define: {
    __APP_VERSION__: JSON.stringify(clientPkg.version),
    __BUILD_COMMIT__: JSON.stringify('desktop'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    'import.meta.url': '__mayanaModuleUrl',
    'import.meta.dirname': '__dirname',
  },
  banner: {
    js: "const __mayanaModuleUrl = require('node:url').pathToFileURL(__filename).href;",
  },
};

await build({
  ...common,
  entryPoints: [join(here, '..', 'src', 'main.ts')],
  outfile: join(here, '..', 'dist', 'main.cjs'),
});

await build({
  ...common,
  entryPoints: [join(here, '..', 'src', 'preload.ts')],
  outfile: join(here, '..', 'dist', 'preload.cjs'),
  // preload 不需要 server，體積留小
  banner: {},
});

/*
 * 前端要跟著 app 一起走：打包後沒有 `client/dist` 這個相對路徑可循，
 * server 的 `resolveStatic()` 會退而找 `<主行程目錄>/../client-dist`。
 */
const clientDist = join(here, '..', '..', 'client', 'dist');
const bundledClient = join(here, '..', 'client-dist');
if (!existsSync(join(clientDist, 'index.html'))) {
  throw new Error('找不到 client/dist/index.html，請先在 client/ 執行 npm run build');
}
rmSync(bundledClient, { recursive: true, force: true });
cpSync(clientDist, bundledClient, { recursive: true });
console.log('  client-dist  已同步');
