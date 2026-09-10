/**
 * 線上模式的連線狀態（`97-selfhosted-server.md`）。
 * 由同源 `/api/version` 或 `?server=ws://host:port` 決定是否連線 server；沒有 server 即現行單機版。
 */
import { create } from 'zustand';

export type OnlineStatus = 'offline' | 'connecting' | 'login' | 'authed' | 'disconnected' | 'version_mismatch';

export interface OnlineState {
  enabled: boolean;
  status: OnlineStatus;
  wsUrl: string | null;
  serverName: string;
  serverVersion: string;
  registration: string;
  username: string | null;
  userId: number | null;
  hasPassword: boolean;
  /** host 帳號：密碼由 server.properties 的 host-password 決定，遊戲裡不提供修改 */
  isHost: boolean;
  error: string | null;
  requiredVersion: string | null;
}

export const useOnlineStore = create<OnlineState>(() => ({
  enabled: false,
  status: 'offline',
  wsUrl: null,
  serverName: '',
  serverVersion: '',
  registration: 'open',
  username: null,
  userId: null,
  hasPassword: false,
  isHost: false,
  error: null,
  requiredVersion: null,
}));

export function isOnline(): boolean {
  return useOnlineStore.getState().enabled;
}

export const SESSION_TOKEN_KEY = 'mayana_session_token';

export function readSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_TOKEN_KEY, token);
    else localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // 無痕模式等取不到 localStorage 時忽略
  }
}

/** `?server=` 明確指定，否則探測同源 server；都沒有就是單機版 */
export async function resolveServerWsUrl(): Promise<string | null> {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get('server');
  if (explicit) return explicit;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch('/api/version', { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json() as { version?: string };
    if (typeof body.version !== 'string') return null;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/ws`;
  } catch {
    return null;
  }
}
