// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveServerWsUrl } from '../online';

/** 正式版只連同源 server；`?server=` 僅開發版生效（`97-selfhosted-server.md` § 97.2 硬性要求） */
const EVIL = 'wss://evil.example/ws';

function visit(search: string) {
  window.history.replaceState(null, '', `/MayanaIdle/${search}`);
}

function serverPresent(present: boolean) {
  const fetchMock = vi.fn(async () => (present
    ? new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 })
    : new Response('', { status: 404 })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  visit('');
});

describe('resolveServerWsUrl', () => {
  it('正式版忽略 ?server=，連同源 server', async () => {
    serverPresent(true);
    visit(`?server=${encodeURIComponent(EVIL)}`);

    expect(await resolveServerWsUrl(false)).toBe(`ws://${window.location.host}/ws`);
  });

  it('正式版帶 ?server= 但同源沒有 server：單機版，不連外部位址', async () => {
    serverPresent(false);
    visit(`?server=${encodeURIComponent(EVIL)}`);

    expect(await resolveServerWsUrl(false)).toBeNull();
  });

  it('開發版採用 ?server=，不探測同源', async () => {
    const fetchMock = serverPresent(true);
    visit(`?server=${encodeURIComponent('ws://127.0.0.1:25580/ws')}`);

    expect(await resolveServerWsUrl(true)).toBe('ws://127.0.0.1:25580/ws');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('開發版沒帶 ?server= 時照常探測同源', async () => {
    serverPresent(true);

    expect(await resolveServerWsUrl(true)).toBe(`ws://${window.location.host}/ws`);
  });
});
