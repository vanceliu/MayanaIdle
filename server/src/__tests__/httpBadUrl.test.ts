import { describe, it, expect, afterEach } from 'vitest';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHttpServer, parseRequestUrl, SECURITY_HEADERS } from '../http';

/** request URL 無法解析回 400（`97-selfhosted-server.md` § 97.2 硬性要求） */
let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

async function start(apiHandler: Parameters<typeof createHttpServer>[0]['apiHandler']): Promise<number> {
  server = createHttpServer({ static: null, basePath: '/MayanaIdle/', apiHandler });
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()));
  return (server!.address() as AddressInfo).port;
}

/** 原樣送出 request line，繞過 client 端的 URL 正規化 */
function rawRequest(port: number, target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    socket.on('data', chunk => { data += chunk.toString(); });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

describe('parseRequestUrl', () => {
  it.each(['//[', '//x:99999', '//a b'])('%s 回 null', raw => {
    expect(parseRequestUrl(raw)).toBeNull();
  });

  it('一般路徑照常解析', () => {
    expect(parseRequestUrl('/api/version?x=1')?.pathname).toBe('/api/version');
  });

  it('沒有 URL 時視為根路徑', () => {
    expect(parseRequestUrl(undefined)?.pathname).toBe('/');
  });
});

describe('HTTP server 收到無法解析的 URL', () => {
  it('回 400，且之後的正常請求照常處理', async () => {
    const port = await start(async (_req, res, url) => {
      if (url.pathname !== '/api/ping') return false;
      res.writeHead(200);
      res.end('pong');
      return true;
    });

    const bad = await rawRequest(port, '//[');
    const good = await rawRequest(port, '/api/ping');

    expect(bad.startsWith('HTTP/1.1 400')).toBe(true);
    expect(good.startsWith('HTTP/1.1 200')).toBe(true);
    expect(good).toContain('pong');
  });

  it('每個回應都帶安全標頭（API、靜態檔、400 皆同）', async () => {
    const port = await start(async (_req, res, url) => {
      if (url.pathname !== '/api/ping') return false;
      res.writeHead(200);
      res.end('pong');
      return true;
    });

    for (const target of ['/api/ping', '/MayanaIdle/', '//[']) {
      const response = (await rawRequest(port, target)).toLowerCase();
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(response).toContain(`${name}: ${value.toLowerCase()}`);
      }
    }
  });

  it('API handler 已送出 header 後才拋錯，只結束回應', async () => {
    const port = await start(async (_req, res) => {
      res.writeHead(200);
      throw new Error('late failure');
    });

    const response = await rawRequest(port, '/api/x');

    expect(response.startsWith('HTTP/1.1 200')).toBe(true);
  });
});
