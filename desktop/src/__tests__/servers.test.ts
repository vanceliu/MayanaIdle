import { describe, it, expect } from 'vitest';
import {
  parseAddress, gameUrl, versionUrl, rememberServer, forgetServer, renameServer, parseServerList, parseOfficialServer, sameServer,
  DEFAULT_PORT, MAX_RECENT_SERVERS, type ServerEntry, type ServerAddress,
} from '../servers';

const http = (host: string, port = DEFAULT_PORT): ServerAddress => ({ scheme: 'http', host, port });
const https = (host: string, port = 443): ServerAddress => ({ scheme: 'https', host, port });

/** 桌面啟動器的「連線到別人的 server」（`97-selfhosted-server.md` § 97.2） */
describe('位址正規化', () => {
  it('只給位址時用 http 與預設埠', () => {
    expect(parseAddress('192.168.1.10')).toEqual(http('192.168.1.10'));
    expect(parseAddress('example.com')).toEqual(http('example.com'));
  });

  it('host:port 照收，前後空白不算數', () => {
    expect(parseAddress('  192.168.1.10:25999  ')).toEqual(http('192.168.1.10', 25999));
  });

  it('整條網址貼進來也行', () => {
    expect(parseAddress('http://192.168.1.10:25580/MayanaIdle/')).toEqual(http('192.168.1.10', 25580));
    expect(parseAddress('ws://10.0.0.2:2000/ws')).toEqual(http('10.0.0.2', 2000));
  });

  it('https／wss 記為 https', () => {
    expect(parseAddress('https://game.lwsky.cc/MayanaIdle/')).toEqual(https('game.lwsky.cc'));
    expect(parseAddress('wss://example.com:8443/ws')).toEqual(https('example.com', 8443));
  });

  it('網址沒寫埠時用協定的預設埠，不是遊戲的預設埠', () => {
    expect(parseAddress('http://example.com/MayanaIdle/')).toEqual(http('example.com', 80));
    expect(parseAddress('https://example.com/')).toEqual(https('example.com', 443));
  });

  it('IPv6 要用方括號寫法', () => {
    expect(parseAddress('[::1]:25580')).toEqual(http('::1', 25580));
    expect(parseAddress('[::1]')).toEqual(http('::1'));
    expect(parseAddress('https://[::1]/')).toEqual(https('::1'));
    expect(parseAddress('::1:25580')).toMatchObject({ error: expect.stringContaining('IPv6') });
  });

  it('空白、壞埠號、其他協定都擋下', () => {
    expect(parseAddress('')).toMatchObject({ error: '請輸入位址' });
    expect(parseAddress('   ')).toMatchObject({ error: '請輸入位址' });
    expect(parseAddress('example.com:0')).toMatchObject({ error: expect.stringContaining('埠號') });
    expect(parseAddress('example.com:70000')).toMatchObject({ error: expect.stringContaining('埠號') });
    expect(parseAddress('example.com:abc')).toMatchObject({ error: expect.stringContaining('埠號') });
    expect(parseAddress('ftp://example.com')).toMatchObject({ error: expect.stringContaining('http') });
  });

  it('遊戲網址與版本確認都用位址的協定，協定預設埠省略', () => {
    expect(gameUrl(http('192.168.1.10', 25580))).toBe('http://192.168.1.10:25580/MayanaIdle/');
    expect(gameUrl(http('::1', 25580))).toBe('http://[::1]:25580/MayanaIdle/');
    expect(gameUrl(https('game.lwsky.cc'))).toBe('https://game.lwsky.cc/MayanaIdle/');
    expect(versionUrl(https('game.lwsky.cc'))).toBe('https://game.lwsky.cc/api/version');
    expect(versionUrl(http('a', 25580))).toBe('http://a:25580/api/version');
  });
});

describe('官方 server', () => {
  it('打包注入的網址照位址規則解析，未設定或壞掉為 null', () => {
    expect(parseOfficialServer('https://game.lwsky.cc/MayanaIdle/')).toEqual(https('game.lwsky.cc'));
    expect(parseOfficialServer('')).toBeNull();
    expect(parseOfficialServer(undefined)).toBeNull();
    expect(parseOfficialServer('ftp://x')).toBeNull();
  });
});

describe('最近連線清單', () => {
  const entry = (host: string, port = 25580, lastUsedAt = 0, name = '', scheme: 'http' | 'https' = 'http'): ServerEntry =>
    ({ scheme, name: name || `${host}:${port}`, host, port, lastUsedAt });

  it('新連線排在最前面', () => {
    const list = rememberServer([entry('a')], http('b'), 100);
    expect(list.map(e => e.host)).toEqual(['b', 'a']);
  });

  it('同一台只留一列，時間更新、名稱沿用', () => {
    const named = rememberServer([], { ...http('a'), name: '朋友的服' }, 1);
    const again = rememberServer(named, http('a'), 200);

    expect(again).toHaveLength(1);
    expect(again[0].name).toBe('朋友的服');
    expect(again[0].lastUsedAt).toBe(200);
  });

  it('埠不同就是不同台', () => {
    const list = rememberServer([entry('a', 25580)], http('a', 25999), 5);
    expect(list).toHaveLength(2);
  });

  it('http 與 https 分開記', () => {
    const list = rememberServer([entry('a', 443)], https('a', 443), 5);
    expect(list.map(e => e.scheme)).toEqual(['https', 'http']);
    expect(sameServer(http('a', 443), https('a', 443))).toBe(false);
  });

  it('主機名比對不分大小寫', () => {
    const list = rememberServer([entry('Example.com')], http('example.com'), 9);
    expect(list).toHaveLength(1);
  });

  it(`最多留 ${MAX_RECENT_SERVERS} 台`, () => {
    let list: ServerEntry[] = [];
    for (let i = 0; i < MAX_RECENT_SERVERS + 5; i++) list = rememberServer(list, http(`h${i}`, 1000 + i), i);
    expect(list).toHaveLength(MAX_RECENT_SERVERS);
    expect(list[0].host).toBe(`h${MAX_RECENT_SERVERS + 4}`);
  });

  it('改名與移除只動到那一台（協定也要相同）', () => {
    const list = [entry('a'), entry('b'), entry('a', 25580, 0, '', 'https')];
    expect(renameServer(list, http('a'), '主場').map(e => e.name)).toEqual(['主場', 'b:25580', 'a:25580']);
    expect(forgetServer(list, http('a')).map(e => `${e.scheme}:${e.host}`)).toEqual(['http:b', 'https:a']);
  });

  it('改成空白就退回位址，不會變成沒有名字的一列', () => {
    expect(renameServer([entry('a')], http('a'), '   ')[0].name).toBe('a:25580');
  });
});

describe('清單存檔', () => {
  it('壞掉的列丟掉，其餘照讀', () => {
    const list = parseServerList([
      { host: 'good', port: 25580, name: 'ok', lastUsedAt: 5 },
      { host: '', port: 25580 },
      { host: 'noport' },
      { host: 'badport', port: 99999 },
      { host: 'badscheme', port: 1, scheme: 'ftp' },
      null,
      'nope',
    ]);
    expect(list.map(e => e.host)).toEqual(['good']);
  });

  it('沒有協定欄位的舊資料視為 http', () => {
    const [old, secure] = parseServerList([
      { host: 'old', port: 25580, lastUsedAt: 2 },
      { host: 'secure', port: 443, scheme: 'https', lastUsedAt: 1 },
    ]);
    expect(old.scheme).toBe('http');
    expect(secure.scheme).toBe('https');
  });

  it('不是陣列就當空的', () => {
    expect(parseServerList(null)).toEqual([]);
    expect(parseServerList({})).toEqual([]);
  });

  it('依最後使用時間排序', () => {
    const list = parseServerList([
      { host: 'old', port: 1, lastUsedAt: 1 },
      { host: 'new', port: 2, lastUsedAt: 9 },
    ]);
    expect(list.map(e => e.host)).toEqual(['new', 'old']);
  });
});
