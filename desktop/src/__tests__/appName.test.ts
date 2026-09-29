import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * app 名決定 `app.getPath('userData')`，也就是世界資料目錄的所在
 * （`97-selfhosted-server.md` § 97.2）。
 */
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf-8'));

describe('app 名', () => {
  it('頂層 productName 存在 —— Electron 在 Windows／Linux 靠它決定 userData 目錄名', () => {
    expect(pkg.productName).toBe('MayanaIdle');
  });

  it('與 electron-builder 的 productName 一致 —— 不一致會讓資料目錄名跟著平台跑掉', () => {
    expect(pkg.productName).toBe(pkg.build.productName);
  });
});
