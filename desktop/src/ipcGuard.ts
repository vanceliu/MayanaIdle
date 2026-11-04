/**
 * 啟動器 API 的呼叫者檢查（`97-selfhosted-server.md` § 97.2 桌面啟動器「啟動器 API」）。
 *
 * 遊戲頁與啟動器共用同一個視窗，preload 在遠端頁面上也會注入；
 * 只有本機的 `ui/launcher.html` 能呼叫主行程。
 */
import { fileURLToPath } from 'node:url';
import { posix, win32 } from 'node:path';

/** `senderUrl` 轉成檔案路徑後與 `launcherPath` 相同才算啟動器頁；Windows 路徑不分大小寫 */
export function isLauncherUrl(senderUrl: string | undefined, launcherPath: string, windows = process.platform === 'win32'): boolean {
  if (!senderUrl) return false;
  let url: URL;
  try {
    url = new URL(senderUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'file:') return false;
  let senderPath: string;
  try {
    senderPath = fileURLToPath(url, { windows });
  } catch {
    return false;
  }
  const path = windows ? win32 : posix;
  const sender = path.resolve(senderPath);
  const launcher = path.resolve(launcherPath);
  return windows ? sender.toLowerCase() === launcher.toLowerCase() : sender === launcher;
}
