import { describe, it, expect } from 'vitest';
import { opensInExternalBrowser } from '../externalLinks';

/** 新視窗交給系統瀏覽器的網址（`34-ui-guidelines.md` § 34.6「回饋」） */
describe('opensInExternalBrowser', () => {
  it('Google 表單交給系統瀏覽器', () => {
    expect(opensInExternalBrowser('https://docs.google.com/forms/d/e/abc/viewform?usp=pp_url')).toBe(true);
  });

  it('其他網址維持 Electron 預設', () => {
    expect(opensInExternalBrowser('http://127.0.0.1:8080/admin')).toBe(false);
    expect(opensInExternalBrowser('https://docs.google.com/document/d/abc')).toBe(false);
    expect(opensInExternalBrowser('http://docs.google.com/forms/d/e/abc')).toBe(false);
  });
});
