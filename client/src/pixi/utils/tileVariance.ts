/**
 * 由格座標算出 0~1 的變化量。同一格永遠得到同一個值，
 * 地圖重繪或視角移動時石頭不會跳動。
 */
export function tileVariance(x: number, y: number, salt = 0): number {
  const h = Math.imul(x * 73856093 ^ y * 19349663 ^ salt * 83492791, 0x45d9f3b);
  return ((h ^ h >>> 15) >>> 0) / 4294967296;
}
