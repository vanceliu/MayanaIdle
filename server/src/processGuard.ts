/**
 * 未處理的 Promise rejection 只記 log、不結束行程（`97-selfhosted-server.md` § 97.2 硬性要求）。
 * 只在行程入口安裝：server 執行檔的 `main()` 與桌面版 main process。
 */
import { log } from './log';

let installed = false;

export function rejectionGuard(reason: unknown): void {
  log.error('未處理的 Promise rejection', reason);
}

export function installRejectionGuard(): void {
  if (installed) return;
  installed = true;
  process.on('unhandledRejection', rejectionGuard);
}
