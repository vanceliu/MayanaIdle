/**
 * 單一執行檔打包（`97-selfhosted-server.md` § 97.2 發布形態）。
 *
 * 流程：client dist ＋ server CJS bundle → SEA blob → 注入該平台的 node 執行檔。
 * 目標平台的 node 從官方 dist 下載後快取在 `server/.node-cache/`，
 * 所以在任何一台機器上都能一次產出三個平台的檔案；只有 macOS 的產物需要在 macOS 上簽章。
 *
 *   node scripts/package.mjs                # 只打包目前這台機器的平台
 *   node scripts/package.mjs --all          # 三個平台都打
 *   node scripts/package.mjs --target linux-x64
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..');
const repoRoot = join(serverRoot, '..');
const clientDist = join(repoRoot, 'client', 'dist');
const buildDir = join(serverRoot, 'dist');
const releaseDir = join(serverRoot, 'release');
const cacheDir = join(serverRoot, '.node-cache');

/** 打包用的 node 版本：node:sqlite 與 SEA 資產都要夠新 */
const NODE_VERSION = process.versions.node;

const TARGETS = {
  'linux-x64': { archive: 'tar.gz', binary: 'bin/node', out: 'mayana-server-linux-x64' },
  'darwin-arm64': { archive: 'tar.gz', binary: 'bin/node', out: 'mayana-server-macos-arm64' },
  'win-x64': { archive: 'zip', binary: 'node.exe', out: 'mayana-server-win-x64.exe' },
};

function hostTarget() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  if (process.platform === 'darwin') return `darwin-${arch}`;
  if (process.platform === 'win32') return 'win-x64';
  return `linux-${arch}`;
}

/** client dist 的每個檔案都要進資產表；鍵沿用相對路徑，HTTP 層照樣用它查 */
async function collectAssets(dir, base = dir, assets = {}) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await collectAssets(full, base, assets);
    else assets['client/' + relative(base, full).split(sep).join('/')] = full;
  }
  return assets;
}

async function ensureNodeBinary(target) {
  const spec = TARGETS[target];
  const dest = join(cacheDir, `${NODE_VERSION}-${target}`, spec.binary.replace('/', sep));
  if (await stat(dest).then(() => true, () => false)) return dest;

  // 自己這台就是目標平台時不必下載
  if (target === hostTarget()) {
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(process.execPath, dest);
    await chmod(dest, 0o755);
    return dest;
  }

  const name = `node-v${NODE_VERSION}-${target}`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${name}.${spec.archive}`;
  const tmp = join(cacheDir, `${name}.${spec.archive}`);
  await mkdir(cacheDir, { recursive: true });
  console.log(`下載 ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載 node 失敗（${res.status}）：${url}`);
  await pipeline(res.body, createWriteStream(tmp));

  const extractDir = join(cacheDir, `${NODE_VERSION}-${target}`);
  await mkdir(extractDir, { recursive: true });
  if (spec.archive === 'tar.gz') {
    execFileSync('tar', ['-xzf', tmp, '-C', extractDir, '--strip-components', '1', `${name}/${spec.binary}`], { stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-o', '-j', tmp, `${name}/${spec.binary}`, '-d', extractDir], { stdio: 'inherit' });
  }
  await rm(tmp, { force: true });
  await chmod(dest, 0o755);
  return dest;
}

async function buildBlob(assets) {
  const configPath = join(buildDir, 'sea-config.json');
  const blobPath = join(buildDir, 'sea-prep.blob');
  await writeFile(configPath, JSON.stringify({
    main: join(buildDir, 'server.cjs'),
    output: blobPath,
    disableExperimentalSEAWarning: true,
    assets,
  }, null, 2));
  execFileSync(process.execPath, ['--experimental-sea-config', configPath], { stdio: 'inherit' });
  return blobPath;
}

async function packageFor(target, blobPath) {
  const spec = TARGETS[target];
  const nodeBinary = await ensureNodeBinary(target);
  const outFile = join(releaseDir, spec.out);
  await mkdir(releaseDir, { recursive: true });
  await copyFile(nodeBinary, outFile);
  await chmod(outFile, 0o755);

  // macOS 的簽章會因為注入而失效，注入前先拿掉、之後再簽回去（ad-hoc 即可）
  const isMac = target.startsWith('darwin');
  if (isMac && process.platform === 'darwin') {
    execFileSync('codesign', ['--remove-signature', outFile], { stdio: 'inherit' });
  }

  const require = createRequire(import.meta.url);
  const postject = require.resolve('postject/dist/cli.js');
  execFileSync(process.execPath, [
    postject, outFile, 'NODE_SEA_BLOB', blobPath,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ...(isMac ? ['--macho-segment-name', 'NODE_SEA'] : []),
  ], { stdio: 'inherit' });

  if (isMac) {
    if (process.platform === 'darwin') {
      execFileSync('codesign', ['--sign', '-', outFile], { stdio: 'inherit' });
    } else {
      console.warn('⚠ 非 macOS 環境無法簽章，產出的 macOS 執行檔在對方機器上會被 Gatekeeper 擋下');
    }
  }
  const size = (await stat(outFile)).size;
  console.log(`✔ ${spec.out}（${(size / 1024 / 1024).toFixed(1)} MB）`);
}

async function main() {
  const argv = process.argv.slice(2);
  const targets = argv.includes('--all')
    ? Object.keys(TARGETS)
    : [argv[argv.indexOf('--target') + 1]].filter(t => t && TARGETS[t]);
  const list = targets.length > 0 ? targets : [hostTarget()];
  for (const t of list) {
    if (!TARGETS[t]) throw new Error(`未知的平台 ${t}（可用：${Object.keys(TARGETS).join('、')}）`);
  }

  if (!await stat(join(clientDist, 'index.html')).then(() => true, () => false)) {
    throw new Error('找不到 client/dist/index.html，請先在 client/ 執行 npm run build');
  }
  if (!await stat(join(buildDir, 'server.cjs')).then(() => true, () => false)) {
    throw new Error('找不到 server/dist/server.cjs，請先執行 npm run build');
  }

  const assets = await collectAssets(clientDist);
  console.log(`前端資產 ${Object.keys(assets).length} 個檔案`);
  const blobPath = await buildBlob(assets);
  for (const t of list) await packageFor(t, blobPath);
  // `package.json` 也被打進 blob 之外的東西一律不留：blob 本身沒有用了
  await rm(blobPath, { force: true });
}

await main();
