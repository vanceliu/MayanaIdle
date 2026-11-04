/**
 * 啟動器頁面唯一能碰到主行程的入口。
 *
 * `contextIsolation` 開著、`nodeIntegration` 關著：頁面拿不到 Node，
 * 只能透過這裡列出的幾支動作。遊戲頁與啟動器共用視窗，這支在遠端頁面上也會跑：
 * 只在 `file:` 頁面暴露 API，呼叫者的實際檢查在主行程（`ipcGuard.ts`）。
 */
import { contextBridge, ipcRenderer } from 'electron';

type ServerTarget = { scheme: 'http' | 'https'; host: string; port: number };

const api = {
  listServers: () => ipcRenderer.invoke('servers:list'),
  officialServer: () => ipcRenderer.invoke('servers:official'),
  forgetServer: (target: ServerTarget) => ipcRenderer.invoke('servers:forget', target),
  renameServer: (target: ServerTarget, name: string) => ipcRenderer.invoke('servers:rename', target, name),
  startWorld: (kind: 'solo' | 'open', id?: string) => ipcRenderer.invoke('world:start', kind, id),
  connect: (address: string, name?: string) => ipcRenderer.invoke('world:connect', address, name),
  listWorlds: () => ipcRenderer.invoke('worlds:list'),
  worldFields: () => ipcRenderer.invoke('worlds:fields'),
  worldConfig: (kind: 'solo' | 'open', id?: string) => ipcRenderer.invoke('worlds:config', kind, id),
  saveWorldConfig: (kind: 'solo' | 'open', id: string | undefined, name: string, values: Record<string, string>) =>
    ipcRenderer.invoke('worlds:saveConfig', kind, id, name, values),
  createWorld: (name: string, values: Record<string, string>) => ipcRenderer.invoke('worlds:create', name, values),
  deleteWorld: (id: string) => ipcRenderer.invoke('worlds:delete', id),
  openDataDir: (kind: 'solo' | 'open', id?: string) => ipcRenderer.invoke('world:openDataDir', kind, id),
  appInfo: () => ipcRenderer.invoke('app:info'),
  quit: () => ipcRenderer.invoke('app:quit'),
  credits: () => ipcRenderer.invoke('app:credits'),
};

if (location.protocol === 'file:') contextBridge.exposeInMainWorld('launcher', api);

export type LauncherApi = typeof api;
