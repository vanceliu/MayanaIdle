/** client 的地圖來源：Vite glob 延遲載入 `data/maps/*.json`。只在瀏覽器與 vitest 使用。 */
import type { MapData } from './mapControl';
import { registerMapSource } from './mapSource';

const mapModules = import.meta.glob<MapData>('../data/maps/*.json', { eager: false, import: 'default' });

function idOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -5);
}

registerMapSource({
  ids: () => Object.keys(mapModules).map(idOf),
  load: async id => {
    const key = Object.keys(mapModules).find(path => idOf(path) === id);
    if (!key) throw new Error(`map not found: ${id}`);
    return await mapModules[key]();
  },
});
