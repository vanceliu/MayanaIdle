/**
 * 「連線到別人的 server」用的位址處理與最近連線清單（`97-selfhosted-server.md` § 97.2）。
 *
 * 清單存在本機，沒有中央登錄服務 —— 私服各開各的，誰也不必向誰註冊。
 */

/** 清單上限：留得住常玩的幾台就夠，再多就變成沒人整理的垃圾堆 */
export const MAX_RECENT_SERVERS = 20;

export const DEFAULT_PORT = 25580;

export type Scheme = 'http' | 'https';

export interface ServerAddress {
  scheme: Scheme;
  host: string;
  port: number;
}

export interface ServerEntry extends ServerAddress {
  /** 顯示用名稱；沒取名就用位址 */
  name: string;
  lastUsedAt: number;
}

export type ParsedAddress = ServerAddress;

/**
 * 把使用者打的東西正規化成協定 + host + port。
 *
 * 接受 `1.2.3.4`、`1.2.3.4:25580`、`http://1.2.3.4:25580/MayanaIdle/`、`https://example.com`、`example.com`。
 * `https://`／`wss://` 為 https，其餘為 http。沒寫埠：沒寫協定用預設埠，http 用 80，https 用 443。
 */
export function parseAddress(raw: string): ParsedAddress | { error: string } {
  const text = raw.trim();
  if (!text) return { error: '請輸入位址' };

  let host = text;
  let port: number | null = null;
  let scheme: Scheme = 'http';

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { error: '看不懂這個位址' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return { error: '只支援 http／https／ws／wss 位址' };
    }
    scheme = url.protocol === 'https:' || url.protocol === 'wss:' ? 'https' : 'http';
    host = url.hostname.replace(/^\[(.*)\]$/, '$1');
    port = url.port ? Number(url.port) : (scheme === 'https' ? 443 : 80);
  } else {
    // IPv6 要用 [::1]:port 的寫法，否則冒號分不清是位址還是埠
    const bracket = /^\[(.+)\](?::(\d+))?$/.exec(text);
    if (bracket) {
      host = bracket[1];
      port = bracket[2] ? Number(bracket[2]) : null;
    } else {
      const parts = text.split(':');
      if (parts.length === 2) {
        host = parts[0];
        port = Number(parts[1]);
      } else if (parts.length > 2) {
        return { error: 'IPv6 位址請用 [位址]:埠 的寫法' };
      }
    }
  }

  host = host.trim();
  if (!host) return { error: '請輸入位址' };
  if (/\s/.test(host)) return { error: '位址不可有空白' };
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    return { error: '埠號必須是 1~65535' };
  }

  return { scheme, host, port: port ?? DEFAULT_PORT };
}

function originOf(address: ServerAddress): string {
  const host = address.host.includes(':') ? `[${address.host}]` : address.host;
  return `${address.scheme}://${host}:${address.port}`;
}

/** 遊戲頁的網址（`basePath` 與 server 的 `BASE_PATH` 一致）；協定預設埠省略 */
export function gameUrl(address: ServerAddress): string {
  return new URL('/MayanaIdle/', originOf(address)).href;
}

/** 連線前確認對方是本遊戲 server 的端點 */
export function versionUrl(address: ServerAddress): string {
  return new URL('/api/version', originOf(address)).href;
}

/** 打包時注入的官方 server 位址；未設定或解析失敗為 null */
export function parseOfficialServer(raw: string | undefined): ServerAddress | null {
  if (!raw) return null;
  const parsed = parseAddress(raw);
  return 'error' in parsed ? null : parsed;
}

/** 協定＋host（不分大小寫）＋埠全同才是同一台 */
export function sameServer(a: ServerAddress, b: ServerAddress): boolean {
  return a.scheme === b.scheme && a.host.toLowerCase() === b.host.toLowerCase() && a.port === b.port;
}

function addressOf(entry: ServerAddress): ServerAddress {
  return { scheme: entry.scheme, host: entry.host, port: entry.port };
}

/**
 * 把一次連線記進清單：同一台就更新時間並移到最前面，不重複建列。
 * 名稱留空時沿用舊名，沒有舊名就用位址。
 */
export function rememberServer(list: ServerEntry[], entry: ServerAddress & { name?: string }, now: number): ServerEntry[] {
  const existing = list.find(e => sameServer(e, entry));
  const name = entry.name?.trim() || existing?.name || `${entry.host}:${entry.port}`;
  const next: ServerEntry = { ...addressOf(entry), name, lastUsedAt: now };
  return [next, ...list.filter(e => !sameServer(e, entry))].slice(0, MAX_RECENT_SERVERS);
}

export function forgetServer(list: ServerEntry[], target: ServerAddress): ServerEntry[] {
  return list.filter(e => !sameServer(e, target));
}

export function renameServer(list: ServerEntry[], target: ServerAddress, name: string): ServerEntry[] {
  const trimmed = name.trim();
  return list.map(e => (sameServer(e, target) ? { ...e, name: trimmed || `${e.host}:${e.port}` } : e));
}

/** 讀存檔：壞掉的列直接丟掉；沒有協定欄位的舊資料視為 http */
export function parseServerList(raw: unknown): ServerEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ServerEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<ServerEntry>;
    if (typeof e.host !== 'string' || !e.host) continue;
    if (typeof e.port !== 'number' || !Number.isInteger(e.port) || e.port < 1 || e.port > 65535) continue;
    if (e.scheme !== undefined && e.scheme !== 'http' && e.scheme !== 'https') continue;
    out.push({
      scheme: e.scheme ?? 'http',
      host: e.host,
      port: e.port,
      name: typeof e.name === 'string' && e.name.trim() ? e.name : `${e.host}:${e.port}`,
      lastUsedAt: typeof e.lastUsedAt === 'number' ? e.lastUsedAt : 0,
    });
  }
  return out.sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_RECENT_SERVERS);
}
