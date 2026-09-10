import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diskStatic, isPackaged, ASSET_PREFIX } from '../staticFiles';

/** 前端來源（`97-selfhosted-server.md` § 97.2 發布形態）：磁碟與執行檔內嵌兩種 */
describe('靜態檔來源', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mayana-static-'));
    writeFileSync(join(dir, 'index.html'), '<html>');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'app-abc.js'), 'console.log(1)');
    writeFileSync(join(dir, '..', 'outside.txt'), 'secret');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('讀得到 bundle 內的檔案', () => {
    const source = diskStatic(dir);
    expect(source.read('index.html')?.toString()).toBe('<html>');
    expect(source.read('assets/app-abc.js')?.toString()).toBe('console.log(1)');
  });

  it('不存在的檔案回 null（由呼叫端決定要不要退回 index.html）', () => {
    expect(diskStatic(dir).read('nope.js')).toBeNull();
  });

  it('`..` 跳脫一律擋下 —— 否則整台機器的檔案都讀得到', () => {
    expect(diskStatic(dir).read('../outside.txt')).toBeNull();
    expect(diskStatic(dir).read('assets/../../outside.txt')).toBeNull();
  });

  it('從原始碼跑不是單一執行檔', () => {
    expect(isPackaged()).toBe(false);
  });

  it('資產鍵有前綴，前端與其他內嵌資料分得開', () => {
    expect(ASSET_PREFIX).toBe('client/');
  });
});
