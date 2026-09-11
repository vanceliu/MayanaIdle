import { describe, it, expect } from 'vitest';
import {
  isValidWorldId, worldIdFromName, uniqueWorldId, parseProperties, formatProperties,
  summarize, buildWorldProperties, portTaken, mergeConfigValues, applyConfigEdits,
  type WorldSummary, type ConfigField, validateConfigValues,
} from '../worlds';

/**
 * 開放世界的清單與建立（`97-selfhosted-server.md` § 97.2 桌面啟動器）。
 * 一個世界＝一個資料目錄，設定的唯一來源是它自己的 `server.properties`。
 */
describe('世界代號', () => {
  it('英數與 - _ 可用，長度有限', () => {
    expect(isValidWorldId('main')).toBe(true);
    expect(isValidWorldId('my-server_2')).toBe(true);
    expect(isValidWorldId('')).toBe(false);
    expect(isValidWorldId('-lead')).toBe(false);
    expect(isValidWorldId('a'.repeat(33))).toBe(false);
  });

  it('路徑跳脫一律不合法 —— 代號會直接變成目錄名', () => {
    expect(isValidWorldId('..')).toBe(false);
    expect(isValidWorldId('../evil')).toBe(false);
    expect(isValidWorldId('a/b')).toBe(false);
  });

  it('名稱轉代號：空白與符號變 -，大寫轉小寫', () => {
    expect(worldIdFromName('My Server', 1)).toBe('my-server');
    expect(worldIdFromName('  test!!  ', 1)).toBe('test');
  });

  it('純中文名稱退回時間戳代號，名稱本身留在 server-name', () => {
    expect(worldIdFromName('主場', 1234)).toBe('world-1234');
  });

  it('撞名加序號，不覆寫既有世界', () => {
    expect(uniqueWorldId('main', [])).toBe('main');
    expect(uniqueWorldId('main', ['main'])).toBe('main-2');
    expect(uniqueWorldId('main', ['main', 'main-2'])).toBe('main-3');
  });
});

describe('properties 讀寫', () => {
  it('註解與空行略過，值裡的等號保留', () => {
    const props = parseProperties('# 註解\n\nserver-name=My Server\ninvite-code=a=b\n');
    expect(props.get('server-name')).toBe('My Server');
    expect(props.get('invite-code')).toBe('a=b');
  });

  it('寫出來的檔案帶註解標頭，且讀得回來', () => {
    const text = formatProperties({ 'server-name': 'X', port: '25999' });
    expect(text.startsWith('#')).toBe(true);
    expect(parseProperties(text).get('port')).toBe('25999');
  });

  it('摘要取得清單要顯示的幾項；缺鍵時用預設', () => {
    const full = summarize('main', 'server-name=主場\nport=25999\nbind=0.0.0.0\nregistration=invite\nadmin-password=x\n');
    expect(full).toEqual({ id: 'main', name: '主場', port: 25999, bind: '0.0.0.0', registration: 'invite', hasAdminPassword: true });

    const bare = summarize('main', '');
    expect(bare).toMatchObject({ name: 'main', port: 25580, registration: 'open', hasAdminPassword: false });
  });

  it('管理密碼只有空白時視為沒設（管理介面會停用）', () => {
    expect(summarize('m', 'admin-password=   \n').hasAdminPassword).toBe(false);
  });
});

describe('建立世界', () => {
  it('bind 一律 0.0.0.0：形態鎖定之後改不回來，不能讓人在表單上填錯', () => {
    expect(buildWorldProperties({ bind: '127.0.0.1', port: '25580' }).bind).toBe('0.0.0.0');
  });

  it('埠與既有世界撞到就擋下', () => {
    const worlds: WorldSummary[] = [
      { id: 'a', name: 'a', port: 25580, bind: '0.0.0.0', registration: 'open', hasAdminPassword: true },
    ];
    expect(portTaken(25580, worlds)).toBe(true);
    expect(portTaken(25581, worlds)).toBe(false);
  });
});

describe('設定表單', () => {
  const intUi = (min: number, max: number) => ({ kind: 'int' as const, min, max, step: 1 });
  const fields: ConfigField[] = [
    { key: 'port', timing: 'restart', ui: intUi(1, 65535), value: '25580' },
    { key: 'max-players', timing: 'live', ui: intUi(1, 100000), value: '50' },
  ];

  it('檔案裡有的用檔案的，沒有的補預設', () => {
    const merged = mergeConfigValues(fields, 'port=25999\n');
    expect(merged).toEqual([
      { key: 'port', timing: 'restart', ui: intUi(1, 65535), value: '25999' },
      { key: 'max-players', timing: 'live', ui: intUi(1, 100000), value: '50' },
    ]);
  });

  it('存檔保留檔案裡原本的鍵（含表單沒列的），再蓋上改過的值', () => {
    const merged = applyConfigEdits('port=25580\nmy-note=保留我\n', { port: '25999' });
    expect(merged).toEqual({ port: '25999', 'my-note': '保留我' });
  });
});

/**
 * 表單存檔前的驗證（`97-selfhosted-server.md` § 97.2）：
 * 走的是 server 啟動時的同一支 `parse`，所以表單存得進去的設定一定啟動得起來。
 */
describe('設定值驗證', () => {
  it('合法的值全部放行', () => {
    expect(validateConfigValues({
      port: '25580', 'max-players': '50', 'exp-rate': '2.5', 'spawn-rate': '0.5',
      registration: 'invite', 'auto-open-browser': 'false',
    }, '/data')).toBeNull();
  });

  it('整數鍵填小數就擋下', () => {
    expect(validateConfigValues({ port: '25580.5' }, '/data')).toContain('port');
    expect(validateConfigValues({ 'max-players': '1.5' }, '/data')).toContain('max-players');
  });

  it('倍率填負數就擋下，小數放行', () => {
    expect(validateConfigValues({ 'gold-rate': '-1' }, '/data')).toContain('gold-rate');
    expect(validateConfigValues({ 'gold-rate': '0.25' }, '/data')).toBeNull();
  });

  it('生怪相關的倍率不可為 0（產出相關的可以）', () => {
    expect(validateConfigValues({ 'spawn-rate': '0' }, '/data')).toContain('spawn-rate');
    expect(validateConfigValues({ 'monster-hp-rate': '0' }, '/data')).toContain('monster-hp-rate');
    expect(validateConfigValues({ 'drop-rate': '0' }, '/data')).toBeNull();
  });

  it('布林與列舉只收自己那幾個字', () => {
    expect(validateConfigValues({ 'auto-open-browser': 'yes' }, '/data')).toContain('auto-open-browser');
    expect(validateConfigValues({ registration: 'nope' }, '/data')).toContain('registration');
  });

  it('表單沒送的鍵不管（保留檔案裡原本的值）', () => {
    expect(validateConfigValues({}, '/data')).toBeNull();
  });
});
