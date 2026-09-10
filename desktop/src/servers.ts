/**
 * 「連線到別人的 server」用的位址處理與最近連線清單（`97-selfhosted-server.md` § 97.2）。
 *
 * 清單存在本機，沒有中央登錄服務 —— 私服各開各的，誰也不必向誰註冊。
 */

/** 清單上限：留得住常玩的幾台就夠，再多就變成沒人整理的垃圾堆 */
export const MAX_RECENT_SERVERS = 20;

export const DEFAULT_PORT = 25580;

export interface ServerEntry {
  /** 顯示用名稱；沒取名就用位址 */
  name: string;
  host: string;
  port: number;
  lastUsedAt: number;
}

export interface ParsedAddress {
  host: string;
  port: number;
}

/**
 * 把使用者打的東西正規化成 host + port。
 *
 * 接受 `1.2.3.4`、`1.2.3.4:25580`、`http://1.2.3.4:25580/MayanaIdle/`、`example.com`。
 * 沒寫埠就用預設值 —— 多數人不會記得埠號，而私服的預設埠只有一個。
 */
export function parseAddress(raw: string): ParsedAddress | { error: string } {
  const text = raw.trim();
  if (!text) return { error: '請輸入位址' };

  let host = text;
  let port: number | null = null;

  // 貼整條網址進來是最常見的用法（對方直接把瀏覽器網址列複製給你）
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { error: '看不懂這個位址' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return { error: '只支援 http／ws 位址' };
    }
    host = url.hostname;
    port = url.port ? Number(url.port) : (url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80);
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

  return { host, port: port ?? DEFAULT_PORT };
}

/** 遊戲頁的網址；`basePath` 與 server 的 `BASE_PATH` 一致 */
export function gameUrl(address: ParsedAddress): string {
  const host = address.host.includes(':') ? `[${address.host}]` : address.host;
  return `http://${host}:${address.port}/MayanaIdle/`;
}

function sameServer(a: { host: string; port: number }, b: { host: string; port: number }): boolean {
  return a.host.toLowerCase() === b.host.toLowerCase() && a.port === b.port;
}

/**
 * 把一次連線記進清單：同一台就更新時間並移到最前面，不重複建列。
 * 名稱留空時沿用舊名，沒有舊名就用位址。
 */
export function rememberServer(list: ServerEntry[], entry: { host: string; port: number; name?: string }, now: number): ServerEntry[] {
  const existing = list.find(e => sameServer(e, entry));
  const name = entry.name?.trim() || existing?.name || `${entry.host}:${entry.port}`;
  const next: ServerEntry = { name, host: entry.host, port: entry.port, lastUsedAt: now };
  return [next, ...list.filter(e => !sameServer(e, entry))].slice(0, MAX_RECENT_SERVERS);
}

export function forgetServer(list: ServerEntry[], target: { host: string; port: number }): ServerEntry[] {
  return list.filter(e => !sameServer(e, target));
}

export function renameServer(list: ServerEntry[], target: { host: string; port: number }, name: string): ServerEntry[] {
  const trimmed = name.trim();
  return list.map(e => (sameServer(e, target) ? { ...e, name: trimmed || `${e.host}:${e.port}` } : e));
}

/** 讀存檔：壞掉的列直接丟掉，不讓一筆爛資料害整份清單消失 */
export function parseServerList(raw: unknown): ServerEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ServerEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<ServerEntry>;
    if (typeof e.host !== 'string' || !e.host) continue;
    if (typeof e.port !== 'number' || !Number.isInteger(e.port) || e.port < 1 || e.port > 65535) continue;
    out.push({
      name: typeof e.name === 'string' && e.name.trim() ? e.name : `${e.host}:${e.port}`,
      host: e.host,
      port: e.port,
      lastUsedAt: typeof e.lastUsedAt === 'number' ? e.lastUsedAt : 0,
    });
  }
  return out.sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_RECENT_SERVERS);
}
