import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectCredits } from './genCredits.mjs';

function pkg(dir, json, licenseText) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(json));
  if (licenseText) writeFileSync(join(dir, 'LICENSE'), licenseText);
}

/** Credits 清單（`97-selfhosted-server.md` § 97.2 桌面啟動器） */
describe('collectCredits', () => {
  let root;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'credits-'));
    const app = join(root, 'app');
    pkg(app, { name: 'app', dependencies: { a: '1', b: '1' }, devDependencies: { dev: '1' } });
    pkg(join(app, 'node_modules', 'a'), { name: 'a', version: '1.0.0', license: 'MIT', dependencies: { c: '1' } }, 'MIT text a');
    pkg(join(app, 'node_modules', 'b'), { name: 'b', version: '2.0.0', license: { type: 'ISC' } });
    pkg(join(app, 'node_modules', 'c'), { name: 'c', version: '3.0.0', license: 'BSD-3-Clause' }, 'BSD text c');
    pkg(join(app, 'node_modules', 'a', 'node_modules', 'c'), { name: 'c', version: '4.0.0', license: 'MIT' });
    pkg(join(app, 'node_modules', 'dev'), { name: 'dev', version: '1.0.0', license: 'MIT' });
    pkg(join(root, 'extra'), { name: 'extra', version: '9.0.0', license: 'MIT' }, 'extra text');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('遞迴展開 production 相依，巢狀版本照 Node 解析順序，不含 devDependencies', () => {
    const credits = collectCredits([join(root, 'app')], [join(root, 'extra')]);
    expect(credits.map(c => `${c.name}@${c.version}`)).toEqual(['a@1.0.0', 'b@2.0.0', 'c@4.0.0', 'extra@9.0.0']);
  });

  it('帶授權類型與授權全文；沒有授權檔為 null', () => {
    const credits = collectCredits([join(root, 'app')]);
    expect(credits.find(c => c.name === 'a')).toMatchObject({ license: 'MIT', text: 'MIT text a' });
    expect(credits.find(c => c.name === 'b')).toMatchObject({ license: 'ISC', text: null });
  });

  it('找不到相依套件時報錯', () => {
    const broken = join(root, 'broken');
    pkg(broken, { name: 'broken', dependencies: { missing: '1' } });
    expect(() => collectCredits([broken])).toThrow('missing');
  });
});
