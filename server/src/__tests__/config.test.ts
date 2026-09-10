import { describe, it, expect } from 'vitest';
import { buildConfig, parseProperties, formatProperties, CONFIG_SPECS } from '../config';
import { resolve } from 'node:path';
import { cacheControlFor } from '../http';
import { parseArgs, DEFAULT_DATA_DIR } from '../index';

describe('server.properties（97 § 97.2）', () => {
  it('缺鍵補預設並記錄', () => {
    const { config, filled, warnings } = buildConfig(parseProperties(''), '/data');
    expect(config.bind).toBe('127.0.0.1');
    expect(config.port).toBe(25580);
    expect(config.maxPlayers).toBe(50);
    expect(config.registration).toBe('open');
    expect(config.adminUser).toBe('admin');
    expect(config.backupDir).toBe('/data/backups');
    expect(config.goldRate).toBe(1);
    expect(filled.length).toBe(CONFIG_SPECS.length);
    expect(warnings).toEqual([]);
  });

  it('解析 key=value、忽略註解與未知鍵', () => {
    const text = '# c\nport=8080\nmax-players=10\nadmin-user=ops\nfoo=1\n';
    const { config, warnings } = buildConfig(parseProperties(text), '/d');
    expect(config.port).toBe(8080);
    expect(config.maxPlayers).toBe(10);
    expect(config.adminUser).toBe('ops');
    expect(warnings).toEqual(['忽略未知的鍵 "foo"']);
  });

  it('非法值中止', () => {
    expect(() => buildConfig(parseProperties('port=99999'), '/d')).toThrow(/port/);
    expect(() => buildConfig(parseProperties('registration=maybe'), '/d')).toThrow(/registration/);
    expect(() => buildConfig(parseProperties('spawn-rate=0'), '/d')).toThrow(/spawn-rate/);
    expect(() => buildConfig(parseProperties('monster-hp-rate=-1'), '/d')).toThrow(/monster-hp-rate/);
    expect(() => buildConfig(parseProperties('auto-open-browser=yes'), '/d')).toThrow(/auto-open-browser/);
  });

  it('倍率允許 0 的鍵：pressure／boss；不允許 0：spawn／hp／attack', () => {
    const { config } = buildConfig(parseProperties('pressure-rate=0\nboss-spawn-rate=0'), '/d');
    expect(config.pressureRate).toBe(0);
    expect(config.bossSpawnRate).toBe(0);
  });

  it('format → parse 往返一致', () => {
    const { config } = buildConfig(parseProperties('port=1234\nserver-name=X'), '/d');
    const again = buildConfig(parseProperties(formatProperties(config)), '/d');
    expect(again.config).toEqual(config);
    expect(again.filled).toEqual([]);
  });
});

describe('命令列參數（§ 97.2）', () => {
  it('未指定 --data-dir 時預設為工作目錄下的 ./data', () => {
    expect(parseArgs([]).dataDir).toBe(resolve(DEFAULT_DATA_DIR));
  });

  it('指定 --data-dir 時解析成絕對路徑', () => {
    expect(parseArgs(['--data-dir', 'foo/bar']).dataDir).toBe(resolve('foo/bar'));
  });
});

describe('靜態檔快取（§ 97.2 同源前端）', () => {
  it('只有帶 content hash 的 assets 可以 immutable', () => {
    expect(cacheControlFor('/MayanaIdle/assets/index-abc123.js')).toContain('immutable');
  });

  it('sw.js 與 index.html 一律 no-cache —— 它們檔名固定、內容會變', () => {
    expect(cacheControlFor('/MayanaIdle/sw.js')).toBe('no-cache');
    expect(cacheControlFor('/MayanaIdle/index.html')).toBe('no-cache');
    expect(cacheControlFor('/MayanaIdle/manifest.webmanifest')).toBe('no-cache');
    expect(cacheControlFor('/MayanaIdle/icons/icon-192.png')).toBe('no-cache');
  });
});

describe('管理介面憑證（§ 97.8）', () => {
  it('admin-user／admin-password 是設定檔的鍵，密碼預設留空＝停用', () => {
    expect(CONFIG_SPECS.some(s => s.key === 'admin-user')).toBe(true);
    expect(CONFIG_SPECS.some(s => s.key === 'admin-password')).toBe(true);
    const config = buildConfig(parseProperties(''), '/data').config;
    expect(config.adminUser).toBe('admin');
    expect(config.adminPassword).toBe('');
  });

  it('舊的 admins／host-password 已經不存在', () => {
    expect(CONFIG_SPECS.some(s => s.key === 'admins')).toBe(false);
    expect(CONFIG_SPECS.some(s => s.key === 'host-password')).toBe(false);
  });
});
