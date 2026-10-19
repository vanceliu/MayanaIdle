/**
 * 連線來源 IP（`97-selfhosted-server.md` § 97.2 `trust-proxy`）。
 * `trust-proxy` 開啟時取 `X-Forwarded-For` 最右一筆（最近一層代理看到的來源），否則取 socket 對端。
 */
import type { IncomingMessage } from 'node:http';

export function clientAddress(req: Pick<IncomingMessage, 'socket'> & Partial<Pick<IncomingMessage, 'headers'>>, trustProxy: boolean): string {
  const peer = req.socket.remoteAddress ?? '';
  if (!trustProxy) return peer;
  const header = req.headers?.['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header;
  const last = raw?.split(',').map(s => s.trim()).filter(Boolean).at(-1);
  return last || peer;
}
