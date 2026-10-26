/**
 * 含機密的檔案（設定檔、資料庫、備份）只給擁有者讀寫（`97-selfhosted-server.md` § 97.2 硬性要求）。
 * `writeFileSync` 的 `mode` 只在建檔時生效，既有檔案另以 `chmod` 收緊。
 * 收緊權限為盡力而為：檔案系統不支援 Unix 權限（FAT／exFAT／NTFS 等）時只記警告，不中止。
 */
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { log } from './log';

export const SECRET_FILE_MODE = 0o600;

const warned = new Set<string>();

export function restrictFile(path: string, chmod: (path: string, mode: number) => void = chmodSync): void {
  if (!existsSync(path)) return;
  try {
    chmod(path, SECRET_FILE_MODE);
  } catch (e) {
    if (warned.has(path)) return;
    warned.add(path);
    log.warn(`無法將 ${path} 權限設為 0600（${(e as NodeJS.ErrnoException).code ?? (e as Error).message}）；檔案系統不支援 Unix 權限時請以掛載選項限制存取`);
  }
}

export function writeSecretFile(path: string, content: string): void {
  writeFileSync(path, content, { encoding: 'utf-8', mode: SECRET_FILE_MODE });
  restrictFile(path);
}
