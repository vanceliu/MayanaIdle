/**
 * 連線心跳（`97-selfhosted-server.md` § 97.2）：每輪對每條連線送 ping，
 * 上一輪的 ping 到這一輪仍沒收到 pong 就中斷，照一般斷線處理。
 * 收到 pong 時把往返時間以 `latency` 推給該連線。
 */
import type { WebSocket, WebSocketServer } from 'ws';
import type { ServerMessage } from '../../client/src/net/protocol';
import { log } from './log';

export const HEARTBEAT_MS = 30_000;

export function startHeartbeat(wss: WebSocketServer, intervalMs = HEARTBEAT_MS): void {
  const pingSentAt = new WeakMap<WebSocket, number>();
  wss.on('connection', socket => {
    socket.on('pong', () => {
      const sentAt = pingSentAt.get(socket);
      if (sentAt === undefined) return;
      pingSentAt.delete(socket);
      if (socket.readyState !== socket.OPEN) return;
      const msg: ServerMessage = { t: 'latency', ms: Math.round(performance.now() - sentAt) };
      socket.send(JSON.stringify(msg));
    });
  });
  const timer = setInterval(() => {
    for (const socket of wss.clients) {
      if (pingSentAt.has(socket)) {
        log.warn('連線心跳逾時，中斷連線');
        socket.terminate();
        continue;
      }
      pingSentAt.set(socket, performance.now());
      socket.ping();
    }
  }, intervalMs);
  timer.unref?.();
  wss.on('close', () => clearInterval(timer));
}
