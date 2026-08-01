/**
 * 除錯開關。**預設一律關閉**，只能在瀏覽器手動開啟，不會被打包成預設行為：
 *
 *   localStorage.setItem('mayana:unlock-regions', '1')   // 解除通行卷軸限制
 *   localStorage.removeItem('mayana:unlock-regions')     // 關閉
 *
 * 用途是測試地圖時免去湊卷軸。因為狀態存在瀏覽器而不是程式碼裡，
 * 不需要事後記得改回來，也不會影響測試。
 */
export function isRegionUnlockEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem('mayana:unlock-regions') === '1';
  } catch {
    return false;                 // SSR／測試環境沒有 localStorage
  }
}
