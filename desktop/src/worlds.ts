/**
 * 開放世界的清單與建立（`97-selfhosted-server.md` § 97.2 桌面啟動器）。
 *
 * 一個世界＝一個資料目錄。開站不會偷偷幫你建一個預設世界：
 * 沒有世界時要先把 `server.properties` 填好才建得出來，
 * 已經有的則直接顯示設定並啟動 —— 設定檔仍是唯一來源（§ 97.2），
 * 這裡只負責產生它與讀回摘要。
 */

/** 目錄名稱：只收檔名安全的字元，長度有限，避免奇怪的路徑 */
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export interface WorldSummary {
  id: string;
  /** `server-name`，沒設就用 id */
  name: string;
  port: number;
  bind: string;
  registration: string;
  /** 沒有管理密碼＝管理介面停用（§ 97.8） */
  hasAdminPassword: boolean;
}

export function isValidWorldId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/**
 * 由 server 名稱推目錄名。中文等非 ASCII 沒辦法安全地當目錄名，
 * 一律退回 `world-<時間戳>`，名稱本身留在 `server-name` 裡。
 */
export function worldIdFromName(name: string, now: number): string {
  const slug = name.trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return isValidWorldId(slug) ? slug : `world-${now}`;
}

/** 目錄名撞到就加序號，不覆寫別人的世界 */
export function uniqueWorldId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 32);
    if (!taken.includes(candidate)) return candidate;
  }
  throw new Error('同名的世界太多了');
}

/** `key=value` 的 properties 檔；`#` 開頭是註解（與 server 端同一套格式） */
export function parseProperties(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    out.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return out;
}

export function formatProperties(values: Record<string, string>): string {
  const lines = ['# MayanaIdle server.properties（docs/design/97-selfhosted-server.md § 97.2）'];
  for (const [key, value] of Object.entries(values)) lines.push(`${key}=${value}`);
  return lines.join('\n') + '\n';
}

export function summarize(id: string, propertiesText: string): WorldSummary {
  const props = parseProperties(propertiesText);
  const port = Number(props.get('port'));
  return {
    id,
    name: props.get('server-name')?.trim() || id,
    port: Number.isInteger(port) ? port : 25580,
    bind: props.get('bind')?.trim() || '127.0.0.1',
    registration: props.get('registration')?.trim() || 'open',
    hasAdminPassword: (props.get('admin-password') ?? '').trim().length > 0,
  };
}

/**
 * 建立世界時要寫進檔案的內容。
 *
 * `bind` 由啟動器決定（開放世界一律 `0.0.0.0`）：形態一經建立即固定（§ 97.1），
 * 讓人在建立表單上把它填成回送位址，等於建出一個永遠變不回開放的「開放世界」。
 */
export function buildWorldProperties(values: Record<string, string>): Record<string, string> {
  return { ...values, bind: '0.0.0.0' };
}

/** 兩個世界跑同一個埠會有一個起不來，建立前先擋 */
export function portTaken(port: number, worlds: readonly WorldSummary[]): boolean {
  return worlds.some(w => w.port === port);
}

export interface ConfigField {
  key: string;
  timing: 'live' | 'restart';
  value: string;
}

/**
 * 表單要顯示的值：檔案裡有就用檔案的，沒有就用該鍵的預設。
 * 欄位清單與預設值來自 server 的設定規格，這裡不重寫一份。
 */
export function mergeConfigValues(fields: readonly ConfigField[], propertiesText: string): ConfigField[] {
  const props = parseProperties(propertiesText);
  return fields.map(f => ({ ...f, value: props.get(f.key) ?? f.value }));
}

/**
 * 存檔要寫回去的內容：保留檔案裡原本就有的鍵（含未知的），再蓋上表單改過的值。
 * 直接用表單重寫整份會把使用者手寫的東西吃掉。
 */
export function applyConfigEdits(propertiesText: string, edits: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of parseProperties(propertiesText)) merged[key] = value;
  for (const [key, value] of Object.entries(edits)) merged[key] = value;
  return merged;
}
