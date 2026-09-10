/**
 * 地圖 JSON 的來源。client 由 Vite glob 提供（`mapSource.vite.ts`），server 由檔案系統或內嵌索引提供。
 */
import type { MapData } from './mapControl';

export interface MapSource {
  ids(): string[];
  load(id: string): Promise<MapData>;
}

let source: MapSource | null = null;

export function registerMapSource(next: MapSource): void {
  source = next;
}

export function requireMapSource(): MapSource {
  if (!source) throw new Error('map source not registered');
  return source;
}
