import type { MapData } from './mapControl';

const mapModules = import.meta.glob<MapData>('../data/maps/*.json', { eager: false, import: 'default' });

const mapCache = new Map<string, MapData>();

function getMapKey(id: string): string | null {
  const suffix = `/${id}.json`;
  for (const path of Object.keys(mapModules)) {
    if (path.endsWith(suffix)) return path;
  }
  return null;
}

export async function getMapForRegion(regionId: string, floor?: number | null): Promise<MapData | null> {
  const id = floor != null ? `${regionId}-${floor}f` : regionId;

  if (mapCache.has(id)) return mapCache.get(id)!;

  let key = getMapKey(id);
  if (!key && floor != null) {
    key = getMapKey(regionId);
  }
  if (!key) {
    key = getMapKey('dawn-plains');
  }
  if (!key) return null;

  const data = await mapModules[key]() as MapData;
  mapCache.set(data.id, data);
  return data;
}

export function clearMapCache(): void {
  mapCache.clear();
}
