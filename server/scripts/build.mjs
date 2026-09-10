// esbuild：ESM（原始碼執行）與 CJS（單一執行檔）兩份 bundle（`97-selfhosted-server.md` § 97.2）
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const clientPkg = JSON.parse(readFileSync(join(here, '..', '..', 'client', 'package.json'), 'utf-8'));

const common = {
  entryPoints: [join(here, '..', 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  logLevel: 'info',
  define: {
    __APP_VERSION__: JSON.stringify(clientPkg.version),
    __BUILD_COMMIT__: JSON.stringify('server'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
};

// 原始碼執行用：相依留在 node_modules，啟動快、改一行不必重打包
await build({
  ...common,
  outfile: join(here, '..', 'dist', 'server.js'),
  format: 'esm',
  external: ['hash-wasm', 'ws'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

/*
 * 單一執行檔用：SEA 只支援 CommonJS，且執行時沒有 node_modules，
 * 所以相依全部打進來。`bufferutil`／`utf-8-validate` 是 ws 的選用加速模組，
 * 它自己用 try/catch 載入，缺了就走純 JS 路徑。
 */
await build({
  ...common,
  outfile: join(here, '..', 'dist', 'server.cjs'),
  format: 'cjs',
  external: ['bufferutil', 'utf-8-validate'],
  define: {
    ...common.define,
    'import.meta.url': '__mayanaModuleUrl',
    'import.meta.dirname': '__dirname',
  },
  banner: {
    js: "const __mayanaModuleUrl = require('node:url').pathToFileURL(__filename).href;",
  },
});
