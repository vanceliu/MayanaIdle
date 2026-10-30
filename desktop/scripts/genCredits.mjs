// 第三方套件授權清單：client、server 的 production 相依（遞迴）＋ Electron，寫成 credits.json
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf-8'));
}

/** Node 的解析順序：從相依者目錄往上找 `node_modules/<name>` */
function resolvePackageDir(name, fromDir, stopDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dir === stopDir) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map(l => l.type ?? l).join(' OR ');
  return 'UNKNOWN';
}

function licenseText(dir) {
  const file = readdirSync(dir).find(f => LICENSE_FILE.test(f));
  return file ? readFileSync(join(dir, file), 'utf-8').trim() : null;
}

function entryOf(dir) {
  const pkg = readJson(join(dir, 'package.json'));
  return {
    name: pkg.name,
    version: pkg.version,
    license: licenseOf(pkg),
    homepage: typeof pkg.homepage === 'string' ? pkg.homepage : null,
    text: licenseText(dir),
  };
}

/** `roots` 各自的 `dependencies` 與 `optionalDependencies` 遞迴展開；`extra` 為直接列入的套件目錄 */
export function collectCredits(roots, extra = []) {
  const seen = new Map();
  const visit = (dir, stopDir) => {
    const entry = entryOf(dir);
    const key = `${entry.name}@${entry.version}`;
    if (seen.has(key)) return;
    seen.set(key, entry);
    const pkg = readJson(join(dir, 'package.json'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      const child = resolvePackageDir(name, dir, stopDir);
      if (child) visit(child, stopDir);
    }
  };
  for (const root of roots) {
    const pkg = readJson(join(root, 'package.json'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      const dir = resolvePackageDir(name, root, root);
      if (!dir) throw new Error(`找不到相依套件 ${name}（${root}），請先 npm install`);
      visit(dir, root);
    }
  }
  for (const dir of extra) visit(dir, dir);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export function writeCredits(outFile) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const credits = collectCredits(
    [join(repo, 'client'), join(repo, 'server')],
    [join(repo, 'desktop', 'node_modules', 'electron')],
  );
  writeFileSync(outFile, JSON.stringify(credits));
  return credits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'credits.json');
  const credits = writeCredits(out);
  console.log(`  credits      ${credits.length} 個套件 → ${out}`);
}
