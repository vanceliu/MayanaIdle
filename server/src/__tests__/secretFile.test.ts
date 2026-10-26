import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SECRET_FILE_MODE, restrictFile, writeSecretFile } from '../secretFile';
import { loadConfig, saveConfig } from '../config';
import { openDatabase } from '../db/sqlite';

/** 機密檔案權限（`97-selfhosted-server.md` § 97.2 硬性要求）；Windows 無 Unix 權限位，略過 */
const modeOf = (path: string) => statSync(path).mode & 0o777;
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mayana-secret-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('權限收緊失敗（不支援 Unix 權限的檔案系統）', () => {
  it('chmod 拋 EPERM：不中止，只記一次警告', () => {
    const dir = tempDir();
    const file = join(dir, 'on-usb');
    writeFileSync(file, 'x');
    const eperm = () => { throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' }); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => restrictFile(file, eperm)).not.toThrow();
    expect(() => restrictFile(file, eperm)).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe.skipIf(process.platform === 'win32')('機密檔案權限', () => {
  it('writeSecretFile：新檔與既有 0644 檔都收緊為 0600', () => {
    const dir = tempDir();
    const fresh = join(dir, 'a');
    const existing = join(dir, 'b');
    writeFileSync(existing, 'old');
    chmodSync(existing, 0o644);

    writeSecretFile(fresh, 'x');
    writeSecretFile(existing, 'y');

    expect(modeOf(fresh)).toBe(SECRET_FILE_MODE);
    expect(modeOf(existing)).toBe(SECRET_FILE_MODE);
  });

  it('server.properties：首次產生與存檔皆為 0600', () => {
    const dir = tempDir();
    const { config } = loadConfig(dir);
    expect(modeOf(join(dir, 'server.properties'))).toBe(SECRET_FILE_MODE);

    chmodSync(join(dir, 'server.properties'), 0o644);
    saveConfig(dir, config);
    expect(modeOf(join(dir, 'server.properties'))).toBe(SECRET_FILE_MODE);
  });

  it('SQLite：主檔與寫入後產生的 WAL／SHM 皆為 0600', () => {
    const dir = tempDir();
    const path = join(dir, 'game.sqlite');
    const db = openDatabase(path);
    db.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1);');

    for (const file of [path, `${path}-wal`, `${path}-shm`]) expect(modeOf(file)).toBe(SECRET_FILE_MODE);
    db.close();
  });
});
