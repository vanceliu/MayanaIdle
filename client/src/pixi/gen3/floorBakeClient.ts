/**
 * 在 Worker 烘焙地板（`38-map-control.md` § 38.9「第三代實作限制」）。
 * 同時只跑一份：新請求會中止進行中的烘焙（舊的 Promise 以 FloorBakeAbortedError 拒絕）。
 * 沒有 Worker 的環境（測試）改在主執行緒烘焙。
 */
import type { MapData } from '../../models/mapControl';
import { bakeFloor, type FloorBounds, type FloorTextures, type Raster } from './floorBake';

export interface FloorBakeRequest { id: number; map: MapData; textures: FloorTextures; bounds: FloorBounds; scale: number }
export interface FloorBakeResponse { id: number; raster: Raster }

export class FloorBakeAbortedError extends Error {
  constructor() {
    super('地板烘焙已被新的請求取代');
    this.name = 'FloorBakeAbortedError';
  }
}

let worker: Worker | null = null;
let nextId = 0;
let inFlight: { id: number; reject: (error: Error) => void } | null = null;

function abortInFlight(): void {
  if (!inFlight) return;
  inFlight.reject(new FloorBakeAbortedError());
  inFlight = null;
  worker?.terminate();
  worker = null;
}

export function bakeFloorAsync(map: MapData, textures: FloorTextures, bounds: FloorBounds, scale: number): Promise<Raster> {
  abortInFlight();
  const id = ++nextId;
  if (typeof Worker === 'undefined') {
    return Promise.resolve().then(() => {
      if (id !== nextId) throw new FloorBakeAbortedError();
      return bakeFloor(map, textures, bounds, scale);
    });
  }
  return new Promise<Raster>((resolve, reject) => {
    worker ??= new Worker(new URL('./floorBake.worker.ts', import.meta.url), { type: 'module' });
    inFlight = { id, reject };
    worker.onmessage = (event: MessageEvent<FloorBakeResponse>) => {
      if (event.data.id !== inFlight?.id) return;
      inFlight = null;
      resolve(event.data.raster);
    };
    worker.onerror = event => {
      if (inFlight?.id !== id) return;
      inFlight = null;
      worker?.terminate();
      worker = null;
      reject(new Error(`地板烘焙失敗：${event.message}`));
    };
    const request: FloorBakeRequest = { id, map, textures, bounds, scale };
    worker.postMessage(request);
  });
}

/** 中止進行中的烘焙並釋放 Worker */
export function disposeFloorBakeWorker(): void {
  abortInFlight();
  worker?.terminate();
  worker = null;
}
