/**
 * 含機密的檔案（設定檔、資料庫、備份）只給擁有者讀寫（`97-selfhosted-server.md` § 97.2 硬性要求）。
 * `writeFileSync` 的 `mode` 只在建檔時生效，既有檔案另以 `chmod` 收緊。
 */
import { chmodSync, existsSync, writeFileSync } from 'node:fs';

export const SECRET_FILE_MODE = 0o600;

export function restrictFile(path: string): void {
  if (existsSync(path)) chmodSync(path, SECRET_FILE_MODE);
}

export function writeSecretFile(path: string, content: string): void {
  writeFileSync(path, content, { encoding: 'utf-8', mode: SECRET_FILE_MODE });
  restrictFile(path);
}
