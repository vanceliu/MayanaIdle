/**
 * 桌面啟動器的主行程（`97-selfhosted-server.md` § 97.2 發布形態）。
 *
 * 三個入口：單機開始、開放開站、連線到別人的 server。
 * 前兩者在**這個行程裡**起 server（Electron 的 Node 有 `node:sqlite`），
 * 所以不必再帶一份 server 執行檔；第三個完全不起 server，直接連過去。
 *
 * 單機與開放各自一個資料目錄：形態一經建立即固定（§ 97.1），
 * 共用一個目錄等於讓「單機世界改成開放」從側門溜進來。
 */
import { app, BrowserWindow, Menu, ipcMain, shell, dialog } from 'electron';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { startServer, type RunningServer } from '../../server/src/index';
import { CONFIG_SPECS } from '../../server/src/config';
import { log } from '../../server/src/log';
import {
  parseAddress, gameUrl, rememberServer, forgetServer, renameServer, parseServerList,
  type ServerEntry,
} from './servers';
import {
  applyConfigEdits, buildWorldProperties, formatProperties, isValidWorldId, mergeConfigValues,
  portTaken, summarize, uniqueWorldId, worldIdFromName, type ConfigField, type WorldSummary,
} from './worlds';

type WorldKind = 'solo' | 'open';

/** 開放世界可以有很多個，各自一個目錄；單機只有一個 */
const OPEN_ROOT = 'open';
const SOLO_DIR = 'solo';

const WINDOW_MIN = { width: 960, height: 640 };

let win: BrowserWindow | null = null;
let running: RunningServer | null = null;

function userDataPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts);
}

function worldDir(kind: WorldKind, id?: string): string {
  if (kind === 'solo') return userDataPath('worlds', SOLO_DIR);
  if (!id || !isValidWorldId(id)) throw new Error(`無效的世界代號：${id ?? '(空)'}`);
  return userDataPath('worlds', OPEN_ROOT, id);
}

const openRootDir = () => userDataPath('worlds', OPEN_ROOT);

/**
 * 舊版把開放世界直接放在 `worlds/open/`，現在那一層是清單的根。
 * 有東西就整包搬進 `worlds/open/default/`，不能讓既有角色憑空消失。
 */
function migrateLegacyOpenWorld(): void {
  const root = openRootDir();
  if (!existsSync(join(root, 'server.properties'))) return;
  const target = join(root, 'default');
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'default') continue;
    renameSync(join(root, entry.name), join(target, entry.name));
  }
  // 搬過家之後，指著舊位置的 `backup-dir` 要跟著改，否則備份會掉到清單的根目錄
  const file = join(target, 'server.properties');
  const text = readFileSync(file, 'utf-8');
  const fixed = applyConfigEdits(text, { 'backup-dir': join(target, 'backups') });
  if (fixed['backup-dir'] !== text.match(/^backup-dir=(.*)$/m)?.[1]) {
    writeFileSync(file, formatProperties(fixed), 'utf-8');
  }
}

function listOpenWorlds(): WorldSummary[] {
  migrateLegacyOpenWorld();
  const root = openRootDir();
  if (!existsSync(root)) return [];
  const out: WorldSummary[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isValidWorldId(entry.name)) continue;
    const file = join(root, entry.name, 'server.properties');
    if (!existsSync(file)) continue;
    out.push(summarize(entry.name, readFileSync(file, 'utf-8')));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 單機世界沒有東西要設定（只有自己、不對外），第一次開就用預設值建起來。
 * 開放世界不走這裡 —— 它一定要先在建立表單把 `server.properties` 填好（§ 97.2）。
 */
function ensureSoloConfig(): void {
  const dir = worldDir('solo');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'server.properties');
  if (existsSync(file)) return;
  writeFileSync(file, 'bind=127.0.0.1\nauto-open-browser=false\n', 'utf-8');
}

const serverListFile = () => userDataPath('servers.json');

function loadServers(): ServerEntry[] {
  try {
    return parseServerList(JSON.parse(readFileSync(serverListFile(), 'utf-8')));
  } catch {
    return [];
  }
}

function saveServers(list: ServerEntry[]): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(serverListFile(), JSON.stringify(list, null, 2), 'utf-8');
}

async function stopServer(): Promise<void> {
  const current = running;
  running = null;
  if (current) await current.close();
}

function launcherFile(): string {
  return join(__dirname, '..', 'ui', 'launcher.html');
}

/**
 * 回到啟動器就把 server 關掉：離開遊戲畫面之後沒有任何地方看得到它，
 * 留著跑等於一台沒人知道還開著的 server。關 app 同理（`before-quit`）。
 */
async function showLauncher(): Promise<void> {
  if (!win) return;
  if (!await confirmKick()) return;
  await stopServer();
  win.setTitle('瑪雅那 Idle');
  await win.loadFile(launcherFile());
}

/** 還有人在線就先問一聲 —— 關掉會把他們踢下線 */
async function confirmKick(): Promise<boolean> {
  const online = running?.onlineCount() ?? 0;
  if (online === 0) return true;
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['關閉 server', '取消'],
    defaultId: 1,
    cancelId: 1,
    message: `還有 ${online} 人在線`,
    detail: '關閉會把他們踢下線（資料已存，不會遺失）。',
  });
  return response === 0;
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: WINDOW_MIN.width,
    minHeight: WINDOW_MIN.height,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 遊戲頁自己的 <title> 會蓋掉視窗標題，但開站時那一行要一直看得到（別人連哪裡）
  win.on('page-title-updated', e => e.preventDefault());
  /*
   * 不變式：畫面回到啟動器時，server 一定不在跑。
   * 只靠選單那條路徑不夠 —— 任何回到啟動器頁的方式都要收掉 server，
   * 否則會留下一台沒有任何地方看得到的 server。
   */
  win.webContents.on('did-navigate', (_e, url) => {
    if (url.startsWith('file://') && running) void stopServer();
  });
  void win.loadFile(launcherFile());
  win.on('closed', () => { win = null; });
}

/** 開站的人要把這個位址給別人；`0.0.0.0` 是監聽位址，不能拿來連 */
function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

/** 選單只留必要的：回到啟動器、重新整理、開發者工具 */
function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: '遊戲',
      submenu: [
        {
          label: '回到啟動器（會關閉 server）',
          accelerator: 'CmdOrCtrl+L',
          click: () => void showLauncher(),
        },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  void stopServer().finally(() => app.quit());
});

// 關閉前一定要把 server 收乾淨：SQLite 沒 close 就走，WAL 會留在半路
app.on('before-quit', event => {
  if (!running) return;
  event.preventDefault();
  void stopServer().finally(() => app.quit());
});

ipcMain.handle('servers:list', () => loadServers());

ipcMain.handle('servers:forget', (_e, target: { host: string; port: number }) => {
  const next = forgetServer(loadServers(), target);
  saveServers(next);
  return next;
});

ipcMain.handle('servers:rename', (_e, target: { host: string; port: number }, name: string) => {
  const next = renameServer(loadServers(), target, name);
  saveServers(next);
  return next;
});

ipcMain.handle('worlds:list', () => listOpenWorlds());

/** 表單欄位由 server 的 `CONFIG_SPECS` 產生，鍵與預設值只有那一份 */
function configFields(dataDir: string): ConfigField[] {
  return CONFIG_SPECS
    // `bind` 由形態決定，不讓人在表單上填成回送位址而建出一個假的開放世界
    .filter(s => s.key !== 'bind')
    .map(s => ({ key: s.key, timing: s.timing, value: s.format(s.default(dataDir) as never) }));
}

ipcMain.handle('worlds:fields', () => configFields(join('<資料目錄>')));

/** 既有世界的設定：檔案裡有的用檔案的，其餘補預設 */
ipcMain.handle('worlds:config', (_e, kind: WorldKind, id?: string) => {
  const dir = kind === 'solo' ? worldDir('solo') : worldDir('open', id);
  const file = join(dir, 'server.properties');
  const text = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  return {
    dir,
    name: summarize(id ?? 'solo', text).name,
    fields: mergeConfigValues(configFields(dir), text),
  };
});

ipcMain.handle('worlds:saveConfig', (_e, kind: WorldKind, id: string | undefined, name: string, values: Record<string, string>) => {
  const dir = kind === 'solo' ? worldDir('solo') : worldDir('open', id);
  const file = join(dir, 'server.properties');

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, message: '埠號必須是 1~65535' };
  if (kind === 'open') {
    const others = listOpenWorlds().filter(w => w.id !== id);
    if (portTaken(port, others)) return { ok: false, message: `埠 ${port} 已經被另一個世界用了` };
  }

  const trimmed = (name ?? '').trim();
  const edits: Record<string, string> = { ...values, ...(trimmed ? { 'server-name': trimmed } : {}) };
  // 形態不可改（§ 97.1）：開放固定 0.0.0.0、單機固定回送位址
  edits.bind = kind === 'solo' ? '127.0.0.1' : '0.0.0.0';

  const current = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, formatProperties(applyConfigEdits(current, edits)), 'utf-8');
  return { ok: true };
});

ipcMain.handle('worlds:create', async (_e, name: string, values: Record<string, string>) => {
  const worlds = listOpenWorlds();
  const trimmed = (name ?? '').trim();
  if (!trimmed) return { ok: false, message: '請填 server 名稱' };

  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, message: '埠號必須是 1~65535' };
  if (portTaken(port, worlds)) return { ok: false, message: `埠 ${port} 已經被另一個世界用了` };

  const id = uniqueWorldId(worldIdFromName(trimmed, Date.now()), worlds.map(w => w.id));
  const dir = worldDir('open', id);
  mkdirSync(dir, { recursive: true });
  const props = buildWorldProperties({ ...values, 'server-name': trimmed });
  writeFileSync(join(dir, 'server.properties'), formatProperties(props), 'utf-8');
  return { ok: true, id };
});

ipcMain.handle('worlds:delete', async (_e, id: string) => {
  const dir = worldDir('open', id);
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['刪除', '取消'],
    defaultId: 1,
    cancelId: 1,
    message: '刪除這個世界？',
    detail: `${dir}\n\n裡面的角色與資料會一起移到垃圾桶。`,
  });
  if (response !== 0) return { ok: false };
  const error = await shell.trashItem(dir).then(() => null, (e: Error) => e.message);
  return error ? { ok: false, message: error } : { ok: true };
});

ipcMain.handle('world:start', async (_e, kind: WorldKind, id?: string) => {
  if (!win) return { ok: false, message: '視窗不存在' };
  const dir = kind === 'solo' ? worldDir('solo') : worldDir('open', id);
  try {
    await stopServer();
    if (kind === 'solo') ensureSoloConfig();
    running = await startServer({ dataDir: dir, openBrowser: false });
    const invite = `${lanAddress() ?? '127.0.0.1'}:${running.port}`;
    win.setTitle(kind === 'solo' ? '瑪雅那 Idle — 單機' : `瑪雅那 Idle — 開放（別人連 ${invite}）`);
    // 本機一律走回送位址：開放世界 bind 的是 0.0.0.0，那個位址連不上
    await win.loadURL(running.localUrl);
    log.info(kind === 'solo' ? '單機世界已啟動' : `開站中：別人連 ${invite}`);
    return { ok: true, url: running.localUrl, invite };
  } catch (e) {
    running = null;
    return { ok: false, message: (e as Error).message, dataDir: dir };
  }
});

ipcMain.handle('world:connect', async (_e, raw: string, name?: string) => {
  if (!win) return { ok: false, message: '視窗不存在' };
  const parsed = parseAddress(raw);
  if ('error' in parsed) return { ok: false, message: parsed.error };

  const url = gameUrl(parsed);
  try {
    // 先確認那台真的是 MayanaIdle server，否則會載入一片空白讓人以為程式壞了
    const res = await fetch(`http://${parsed.host}:${parsed.port}/api/version`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`server 回應 ${res.status}`);
    const body = await res.json() as { version?: string; serverName?: string };
    if (typeof body.version !== 'string') throw new Error('對方不是 MayanaIdle server');

    await stopServer();
    saveServers(rememberServer(loadServers(), { ...parsed, name: name || body.serverName }, Date.now()));
    win.setTitle(`瑪雅那 Idle — ${body.serverName ?? parsed.host}`);
    await win.loadURL(url);
    return { ok: true, url };
  } catch (e) {
    const reason = e instanceof Error && e.name === 'TimeoutError' ? '連線逾時' : (e as Error).message;
    return { ok: false, message: `連不上 ${parsed.host}:${parsed.port}（${reason}）` };
  }
});

ipcMain.handle('world:openDataDir', async (_e, kind: WorldKind, id?: string) => {
  const dir = kind === 'solo' ? worldDir('solo') : worldDir('open', id);
  mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
});

declare const __APP_VERSION__: string;

ipcMain.handle('app:info', () => ({
  // 顯示的是**遊戲**版本（與 server、前端同一個），不是 Electron 殼的版本
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : app.getVersion(),
  userData: app.getPath('userData'),
}));
