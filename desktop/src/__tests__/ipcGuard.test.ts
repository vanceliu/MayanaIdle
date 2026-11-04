import { describe, it, expect } from 'vitest';
import { isLauncherUrl } from '../ipcGuard';

/** 啟動器 API 只限啟動器頁呼叫（`97-selfhosted-server.md` § 97.2） */
describe('啟動器 API 呼叫者檢查', () => {
  const mac = '/Applications/MayanaIdle.app/Contents/Resources/app.asar/ui/launcher.html';
  const macUrl = 'file:///Applications/MayanaIdle.app/Contents/Resources/app.asar/ui/launcher.html';
  const isMac = (url: string | undefined) => isLauncherUrl(url, mac, false);

  it('啟動器頁放行，帶 query 或 hash 也一樣', () => {
    expect(isMac(macUrl)).toBe(true);
    expect(isMac(`${macUrl}?x=1`)).toBe(true);
    expect(isMac(`${macUrl}#top`)).toBe(true);
  });

  it('遠端頁面一律拒絕', () => {
    expect(isMac('http://127.0.0.1:25580/MayanaIdle/')).toBe(false);
    expect(isMac('https://game.lwsky.cc/MayanaIdle/')).toBe(false);
    expect(isMac('http://evil.example/Applications/MayanaIdle.app/Contents/Resources/app.asar/ui/launcher.html')).toBe(false);
  });

  it('其他本機檔案拒絕，包含路徑前綴相同的', () => {
    expect(isMac('file:///tmp/launcher.html')).toBe(false);
    expect(isMac(`${macUrl}.x`)).toBe(false);
    expect(isMac(macUrl.replace('/ui/', '/ui-x/'))).toBe(false);
  });

  it('`..` 繞回啟動器路徑時以解析後的路徑為準', () => {
    expect(isMac('file:///Applications/MayanaIdle.app/Contents/Resources/app.asar/ui/x/../launcher.html')).toBe(true);
    expect(isMac('file:///Applications/MayanaIdle.app/Contents/Resources/app.asar/ui/../launcher.html')).toBe(false);
  });

  it('路徑含空格與非 ASCII 時依網址編碼比對', () => {
    const path = '/Users/me/My Games/瑪雅那/ui/launcher.html';
    expect(isLauncherUrl('file:///Users/me/My%20Games/%E7%91%AA%E9%9B%85%E9%82%A3/ui/launcher.html', path, false)).toBe(true);
  });

  it('沒有網址、看不懂的網址拒絕', () => {
    expect(isMac(undefined)).toBe(false);
    expect(isMac('')).toBe(false);
    expect(isMac('not a url')).toBe(false);
    expect(isMac('about:blank')).toBe(false);
  });

  it('Windows 路徑不分大小寫', () => {
    const win = 'C:\\Program Files\\MayanaIdle\\resources\\app.asar\\ui\\launcher.html';
    expect(isLauncherUrl('file:///C:/Program%20Files/MayanaIdle/resources/app.asar/ui/launcher.html', win, true)).toBe(true);
    expect(isLauncherUrl('file:///c:/program%20files/mayanaidle/resources/app.asar/ui/launcher.html', win, true)).toBe(true);
    expect(isLauncherUrl('file:///D:/Program%20Files/MayanaIdle/resources/app.asar/ui/launcher.html', win, true)).toBe(false);
  });
});
