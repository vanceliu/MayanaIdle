/** server 的地圖來源：build 時由 `scripts/genMapsIndex.mjs` 內嵌全部 JSON */
import { registerMapSource } from '../../client/src/models/mapSource';
import { MAPS } from './generated/mapsIndex';

export function registerBundledMaps(): number {
  const ids = Object.keys(MAPS);
  registerMapSource({
    ids: () => ids,
    load: async id => {
      const map = MAPS[id];
      if (!map) throw new Error(`map not found: ${id}`);
      return map;
    },
  });
  return ids.length;
}
