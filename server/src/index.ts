/**
 * server 入口（`97-selfhosted-server.md` § 97.2）：命令列只有 `--data-dir`，其餘由 `server.properties` 決定。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { setRates } from '../../client/src/core/rates';
import { defaultSession } from '../../client/src/stores/session';
import { loadTemplateCache } from '../../client/src/systems/templateSync';
import { loadConfig, isLoopbackBind, type ServerConfig } from './config';
import { openDatabase, migrate, assertSchemaIntact, resolveWorldMode, DB_FILE, type WorldMode } from './db/sqlite';
import { SqliteRepository } from './db/sqliteRepository';
import { AuthService } from './auth';
import { registerBundledMaps } from './maps';
import { createHttpServer } from './http';
import { diskStatic, isPackaged, seaStatic, type StaticSource } from './staticFiles';
import { GameServer } from './ws';
import { TickLoop } from './tick';
import { computeLeaderboard } from './leaderboard';
import { createAdminHandler } from './admin';
import { log } from './log';

declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const BASE_PATH = '/MayanaIdle/';
/** 單機世界自動登入的遊戲帳號（`97-selfhosted-server.md` § 97.5）。與管理帳號無關 */
const HOST_USERNAME = 'host';

/** `--data-dir` 未指定時的預設資料目錄（相對於工作目錄，`97-selfhosted-server.md` § 97.2） */
export const DEFAULT_DATA_DIR = 'data';

export function parseArgs(argv: string[]): { dataDir: string; staticDir: string | null } {
  let dataDir = resolve(DEFAULT_DATA_DIR);
  let staticDir: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data-dir' && argv[i + 1]) dataDir = resolve(argv[++i]);
    else if (argv[i] === '--static' && argv[i + 1]) staticDir = resolve(argv[++i]);
  }
  return { dataDir, staticDir };
}

function defaultStaticDir(): string | null {
  const candidates = [
    join(import.meta.dirname, '..', '..', 'client', 'dist'),
    join(import.meta.dirname, '..', 'client-dist'),
  ];
  return candidates.find(p => existsSync(join(p, 'index.html'))) ?? null;
}

/** 單一執行檔一律用內嵌的前端；從原始碼跑才找磁碟（`--static` 優先） */
function resolveStatic(staticArg: string | null): StaticSource | null {
  if (isPackaged()) return seaStatic();
  const dir = staticArg ?? defaultStaticDir();
  return dir ? diskStatic(dir) : null;
}

export function applyRates(config: ServerConfig): void {
  setRates({
    gold: config.goldRate, drop: config.dropRate, exp: config.expRate, pressure: config.pressureRate,
    spawn: config.spawnRate, monsterHp: config.monsterHpRate, monsterAttack: config.monsterAttackRate, bossSpawn: config.bossSpawnRate,
  });
}

function hasGraphicalEnvironment(): boolean {
  if (process.platform === 'darwin' || process.platform === 'win32') return true;
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? ['open', url]
    : process.platform === 'win32' ? ['cmd', '/c', 'start', '', url]
    : ['xdg-open', url];
  try {
    spawn(cmd[0], cmd.slice(1), { stdio: 'ignore', detached: true }).unref();
  } catch (e) {
    log.warn('open browser failed', e);
  }
}

/** 把 listen 的系統錯誤翻成「知道下一步該做什麼」的訊息 */
function listenErrorMessage(e: NodeJS.ErrnoException, bind: string, port: number, dataDir: string): string {
  const where = `${join(dataDir, 'server.properties')} 的 port`;
  if (e.code === 'EADDRINUSE') {
    return `埠 ${port} 已經被別的程式占用了。關掉那個程式，或改 ${where}。`;
  }
  if (e.code === 'EACCES') {
    return `沒有權限使用埠 ${port}（1024 以下的埠需要管理者權限）。改 ${where}。`;
  }
  if (e.code === 'EADDRNOTAVAIL') {
    return `這台機器沒有 ${bind} 這個位址。改 ${join(dataDir, 'server.properties')} 的 bind。`;
  }
  return `無法在 ${bind}:${port} 開啟服務：${e.message}`;
}

export interface StartOptions {
  dataDir: string;
  /** 前端 bundle 的磁碟位置；省略時自動找（單一執行檔一律用內嵌的） */
  staticDir?: string | null;
  /** 啟動後是否開瀏覽器。桌面啟動器自己開視窗，所以會關掉它 */
  openBrowser?: boolean;
}

export interface RunningServer {
  /** 對外顯示用；開放形態是 bind 位址 */
  url: string;
  /** 本機連得上的位址。`0.0.0.0` 是監聽位址、不是連線位址，本機一律走回送位址 */
  localUrl: string;
  port: number;
  mode: WorldMode;
  dataDir: string;
  /** 目前在線人數；桌面啟動器用它判斷「關掉會踢到人嗎」 */
  onlineCount: () => number;
  /** graceful shutdown：停 tick、關連線、flush、關 DB */
  close: () => Promise<void>;
}

/**
 * 起一台 server（`97-selfhosted-server.md` § 97.2）。
 *
 * 命令列與桌面啟動器共用這一支：形態鎖定、schema 檢查、host 帳號一次都不能少，
 * 各寫一份的結果是兩種入口的行為悄悄長歪。失敗一律拋，由呼叫端決定怎麼呈現。
 */
export async function startServer(options: StartOptions): Promise<RunningServer> {
  const { dataDir } = options;
  mkdirSync(dataDir, { recursive: true });
  const loaded = loadConfig(dataDir);
  for (const w of loaded.warnings) log.warn(w);
  if (loaded.filled.length > 0) log.info(`server.properties 補寫預設鍵：${loaded.filled.join(', ')}`);
  let config = loaded.config;

  const db = openDatabase(join(dataDir, DB_FILE));
  const migrated = migrate(db);
  assertSchemaIntact(db);
  log.info(`SQLite ${join(dataDir, DB_FILE)}（schema v${migrated.from} → v${migrated.to}）`);

  const repo = new SqliteRepository(db);
  defaultSession.repo = repo;
  await loadTemplateCache(repo);
  applyRates(config);
  log.info(`地圖 ${registerBundledMaps()} 張`);

  // 形態一經建立即固定：`bind` 換成另一種形態一律拒絕啟動（§ 97.1）
  const requestedMode: WorldMode = isLoopbackBind(config.bind) ? 'solo' : 'open';
  let mode: WorldMode;
  try {
    mode = resolveWorldMode(db, requestedMode);
  } catch (e) {
    db.close();
    throw e;
  }

  const auth = new AuthService(db);
  // 單機世界只有一個玩家，開機自動登入這個帳號；開放世界人人自己註冊，不需要它
  const hostUsername = HOST_USERNAME;
  if (mode === 'solo') auth.ensureHost(hostUsername);
  if (!config.adminPassword) {
    log.warn('server.properties 的 admin-password 是空的，管理介面無法登入（§ 97.8）');
  }

  const gameServer = new GameServer({ repo, auth, config: () => config, version: VERSION, hostUsername, leaderboard: top => computeLeaderboard(db, top) });
  const tickLoop = new TickLoop(gameServer.world);
  const staticSource = resolveStatic(options.staticDir ?? null);

  const admin = createAdminHandler({
    db,
    dataDir,
    dbPath: join(dataDir, DB_FILE),
    auth,
    server: gameServer,
    stats: () => tickLoop.stats(),
    config: () => config,
    setConfig: next => {
      config = next;
      // `live` 的鍵即時生效：倍率立刻換掉，其餘由 `config()` 的呼叫端自然讀到
      applyRates(config);
    },
    version: VERSION,
  });

  const httpServer = createHttpServer({
    static: staticSource,
    basePath: BASE_PATH,
    apiHandler: async (req, res, url) => {
      if (await admin(req, res, url)) return true;
      if (url.pathname === '/api/version') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ version: VERSION, serverName: config.serverName, registration: config.registration }));
        return true;
      }
      if (url.pathname === '/api/status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ version: VERSION, online: gameServer.onlineCount(), connections: gameServer.sessions.size, instances: gameServer.world.instances.count(), parties: gameServer.world.parties.parties.size, tick: tickLoop.stats(), bind: config.bind }));
        return true;
      }
      return false;
    },
  });
  // 傳輸層上限（聊天字數上限另見 `97-selfhosted-server.md` § 97.10 未定案）
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 64 * 1024 });
  gameServer.attach(wss);

  /*
   * listen 失敗時 `WebSocketServer` 會把同一個錯誤再丟一次（它掛在 httpServer 上），
   * 兩個都要接 —— 少接一個就會變成整個行程的未捕捉例外，桌面啟動器會直接跳崩潰視窗。
   */
  try {
    await new Promise<void>((resolveListen, reject) => {
      const fail = (e: Error) => reject(e);
      httpServer.once('error', fail);
      wss.once('error', fail);
      httpServer.listen(config.port, config.bind, () => {
        httpServer.off('error', fail);
        wss.off('error', fail);
        resolveListen();
      });
    });
  } catch (e) {
    wss.close();
    httpServer.close();
    db.close();
    throw new Error(listenErrorMessage(e as NodeJS.ErrnoException, config.bind, config.port, dataDir));
  }
  // 起來之後的傳輸層錯誤只記錄，不讓它掀掉整個行程
  httpServer.on('error', e => log.error('http server 錯誤', e));
  wss.on('error', e => log.error('websocket server 錯誤', e));
  tickLoop.start();

  const url = `http://${isLoopbackBind(config.bind) ? '127.0.0.1' : config.bind}:${config.port}${BASE_PATH}`;
  log.info(`${config.serverName} v${VERSION}`);
  log.info(`連線位址 ${url}`);
  log.info(`管理介面 ${url.replace(BASE_PATH, '/admin')}`);
  log.info(`資料目錄 ${dataDir}`);
  log.info(`形態 ${mode === 'solo' ? `單機（bind ${config.bind}，自動登入 ${hostUsername}）` : `開放（bind ${config.bind}）`}`);
  log.info(`管理介面帳號 ${config.adminUser}${config.adminPassword ? '' : '（未設密碼，停用）'}`);
  if (staticSource) log.info(`前端 ${staticSource.describe}`);
  else log.warn('找不到前端 bundle，只提供 WebSocket 與 API（--static <dir> 指定）');

  if (options.openBrowser !== false && config.autoOpenBrowser && hasGraphicalEnvironment() && staticSource) openBrowser(url);

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    tickLoop.stop();
    httpServer.close();
    await gameServer.shutdown();
    wss.close();
    db.close();
  };

  const localUrl = `http://127.0.0.1:${config.port}${BASE_PATH}`;
  return { url, localUrl, port: config.port, mode, dataDir, onlineCount: () => gameServer.onlineCount(), close };
}

async function main(): Promise<void> {
  const { dataDir, staticDir } = parseArgs(process.argv.slice(2));
  const server = await startServer({ dataDir, staticDir });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal}：graceful shutdown`);
    await server.close();
    log.info('已關閉');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/**
 * 只有「直接執行這支檔案」才啟動 server。
 * 少了這道判斷，任何 import 這個模組的地方（測試匯入 `parseArgs`）都會開資料庫並佔用埠。
 *
 * 單一執行檔沒有這個問題，而且 `process.argv[1]` 是執行檔本身、比不到腳本路徑，
 * 所以先認 SEA。
 */
const executedDirectly = isPackaged()
  || (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href);

if (executedDirectly) {
  main().catch(e => {
    log.error('啟動失敗', e);
    process.exit(1);
  });
}
