/** 靜態檔與 API（`97-selfhosted-server.md` § 97.2：前端由 server 自己 serve，必須同源） */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname } from 'node:path';
import type { StaticSource } from './staticFiles';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};

/**
 * 快取策略：**只有帶 content hash 的檔名才可以 immutable**。
 *
 * Vite 把 hash 放在 `assets/` 底下的檔名裡，同一個檔名的內容永遠一樣。
 * 其餘（`index.html`、`sw.js`、`manifest.webmanifest`、圖示）檔名固定、內容會隨版本變，
 * 標成 immutable 等於讓回訪的瀏覽器一年之內都拿不到新版 —— Service Worker 尤其嚴重：
 * 它是更新機制本身，被凍住之後任何修正都送不出去。
 */
export function cacheControlFor(pathname: string): string {
  return pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

export interface HttpOptions {
  /** 前端 bundle 的來源（磁碟或執行檔內嵌）；null 表示只提供 API 與 WebSocket */
  static: StaticSource | null;
  /** 前端 bundle 的 base path（Vite `base`） */
  basePath: string;
  apiHandler: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;
}

export function createHttpServer(options: HttpOptions) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (await options.apiHandler(req, res, url)) return;
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: (e as Error).message }));
      return;
    }
    serveStatic(options, url.pathname, res);
  });
}

function serveStatic(options: HttpOptions, pathname: string, res: ServerResponse): void {
  const source = options.static;
  if (!source) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('static files not configured');
    return;
  }
  if (pathname === '/' || pathname === options.basePath.replace(/\/$/, '')) {
    res.writeHead(302, { location: options.basePath });
    res.end();
    return;
  }
  let rel = pathname.startsWith(options.basePath) ? pathname.slice(options.basePath.length) : pathname.replace(/^\//, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';

  // 找不到檔案就回 index.html：前端是 SPA，深層網址要交給它自己解
  const direct = source.read(rel);
  const body = direct ?? source.read('index.html');
  if (!body) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const ext = extname(direct ? rel : 'index.html');
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': cacheControlFor(pathname),
  });
  res.end(body);
}
