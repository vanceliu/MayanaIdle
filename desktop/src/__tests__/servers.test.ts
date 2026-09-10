import { describe, it, expect } from 'vitest';
import {
  parseAddress, gameUrl, rememberServer, forgetServer, renameServer, parseServerList,
  DEFAULT_PORT, MAX_RECENT_SERVERS, type ServerEntry,
} from '../servers';

/** 桌面啟動器的「連線到別人的 server」（`97-selfhosted-server.md` § 97.2） */
describe('位址正規化', () => {
  it('只給位址時補上預設埠', () => {
    expect(parseAddress('192.168.1.10')).toEqual({ host: '192.168.1.10', port: DEFAULT_PORT });
    expect(parseAddress('example.com')).toEqual({ host: 'example.com', port: DEFAULT_PORT });
  });

  it('host:port 照收，前後空白不算數', () => {
    expect(parseAddress('  192.168.1.10:25999  ')).toEqual({ host: '192.168.1.10', port: 25999 });
  });

  it('整條網址貼進來也行 —— 那是對方最可能給你的東西', () => {
    expect(parseAddress('http://192.168.1.10:25580/MayanaIdle/')).toEqual({ host: '192.168.1.10', port: 25580 });
    expect(parseAddress('ws://10.0.0.2:2000/ws')).toEqual({ host: '10.0.0.2', port: 2000 });
  });

  it('網址沒寫埠時用協定的預設埠，不是遊戲的預設埠', () => {
    expect(parseAddress('http://example.com/MayanaIdle/')).toEqual({ host: 'example.com', port: 80 });
    expect(parseAddress('https://example.com/')).toEqual({ host: 'example.com', port: 443 });
  });

  it('IPv6 要用方括號寫法', () => {
    expect(parseAddress('[::1]:25580')).toEqual({ host: '::1', port: 25580 });
    expect(parseAddress('[::1]')).toEqual({ host: '::1', port: DEFAULT_PORT });
    expect(parseAddress('::1:25580')).toMatchObject({ error: expect.stringContaining('IPv6') });
  });

  it('空白、壞埠號、非 http 協定都擋下', () => {
    expect(parseAddress('')).toMatchObject({ error: '請輸入位址' });
    expect(parseAddress('   ')).toMatchObject({ error: '請輸入位址' });
    expect(parseAddress('example.com:0')).toMatchObject({ error: expect.stringContaining('埠號') });
    expect(parseAddress('example.com:70000')).toMatchObject({ error: expect.stringContaining('埠號') });
    expect(parseAddress('example.com:abc')).toMatchObject({ error: expect.stringContaining('埠號') });
    expect(parseAddress('ftp://example.com')).toMatchObject({ error: expect.stringContaining('http') });
  });

  it('遊戲網址帶著 base path，IPv6 補回方括號', () => {
    expect(gameUrl({ host: '192.168.1.10', port: 25580 })).toBe('http://192.168.1.10:25580/MayanaIdle/');
    expect(gameUrl({ host: '::1', port: 25580 })).toBe('http://[::1]:25580/MayanaIdle/');
  });
});

describe('最近連線清單', () => {
  const entry = (host: string, port = 25580, lastUsedAt = 0, name = ''): ServerEntry =>
    ({ name: name || `${host}:${port}`, host, port, lastUsedAt });

  it('新連線排在最前面', () => {
    const list = rememberServer([entry('a')], { host: 'b', port: 25580 }, 100);
    expect(list.map(e => e.host)).toEqual(['b', 'a']);
  });

  it('同一台只留一列，時間更新、名稱沿用', () => {
    const named = rememberServer([], { host: 'a', port: 25580, name: '朋友的服' }, 1);
    const again = rememberServer(named, { host: 'a', port: 25580 }, 200);

    expect(again).toHaveLength(1);
    expect(again[0].name).toBe('朋友的服');
    expect(again[0].lastUsedAt).toBe(200);
  });

  it('埠不同就是不同台', () => {
    const list = rememberServer([entry('a', 25580)], { host: 'a', port: 25999 }, 5);
    expect(list).toHaveLength(2);
  });

  it('主機名比對不分大小寫', () => {
    const list = rememberServer([entry('Example.com')], { host: 'example.com', port: 25580 }, 9);
    expect(list).toHaveLength(1);
  });

  it(`最多留 ${MAX_RECENT_SERVERS} 台`, () => {
    let list: ServerEntry[] = [];
    for (let i = 0; i < MAX_RECENT_SERVERS + 5; i++) list = rememberServer(list, { host: `h${i}`, port: 1000 + i }, i);
    expect(list).toHaveLength(MAX_RECENT_SERVERS);
    expect(list[0].host).toBe(`h${MAX_RECENT_SERVERS + 4}`);
  });

  it('改名與移除只動到那一台', () => {
    const list = [entry('a'), entry('b')];
    expect(renameServer(list, { host: 'a', port: 25580 }, '主場').map(e => e.name)).toEqual(['主場', 'b:25580']);
    expect(forgetServer(list, { host: 'a', port: 25580 }).map(e => e.host)).toEqual(['b']);
  });

  it('改成空白就退回位址，不會變成沒有名字的一列', () => {
    expect(renameServer([entry('a')], { host: 'a', port: 25580 }, '   ')[0].name).toBe('a:25580');
  });
});

describe('清單存檔', () => {
  it('壞掉的列丟掉，其餘照讀 —— 一筆爛資料不該害整份清單消失', () => {
    const list = parseServerList([
      { host: 'good', port: 25580, name: 'ok', lastUsedAt: 5 },
      { host: '', port: 25580 },
      { host: 'noport' },
      { host: 'badport', port: 99999 },
      null,
      'nope',
    ]);
    expect(list.map(e => e.host)).toEqual(['good']);
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
