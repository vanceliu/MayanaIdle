const EXTERNAL_BROWSER_PREFIXES = ['https://docs.google.com/forms/'];

/** 交給系統瀏覽器開的新視窗網址（`34-ui-guidelines.md` § 34.6「回饋」）；其餘維持 Electron 預設 */
export function opensInExternalBrowser(url: string): boolean {
  return EXTERNAL_BROWSER_PREFIXES.some(prefix => url.startsWith(prefix));
}
