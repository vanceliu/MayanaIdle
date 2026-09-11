/**
 * `server.properties`（`97-selfhosted-server.md` § 97.2）：server 的所有可調項目只有這一個來源。
 * `key=value`、UTF-8、`#` 為註解；缺鍵補預設寫回，非法值中止啟動，未知鍵忽略並警告。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type Registration = 'open' | 'invite' | 'closed';

export interface ServerConfig {
  serverName: string;
  bind: string;
  port: number;
  maxPlayers: number;
  registration: Registration;
  inviteCode: string;
  /**
   * 管理介面的帳號密碼（`97-selfhosted-server.md` § 97.8）。
   * **與遊戲帳號完全分開**：不在 `users` 表裡，管理員不是玩家。
   */
  adminUser: string;
  adminPassword: string;
  autoOpenBrowser: boolean;
  backupDir: string;
  goldRate: number;
  dropRate: number;
  expRate: number;
  pressureRate: number;
  spawnRate: number;
  monsterHpRate: number;
  monsterAttackRate: number;
  bossSpawnRate: number;
}

/** 生效時機：`restart` 的鍵改動後由管理介面標示需重啟 */
export type ApplyTiming = 'live' | 'restart';

/**
 * 輸入型別（`97-selfhosted-server.md` § 97.2）。
 * 給編輯設定的介面用，**限制本身仍由 `parse` 決定** —— 這裡只描述該長成什麼樣子的輸入框。
 */
export interface FieldUi {
  kind: 'text' | 'password' | 'path' | 'int' | 'rate' | 'bool' | 'enum';
  /** int／rate：可輸入的範圍。rate 的 min 為 0 或大於 0 的最小值 */
  min?: number;
  max?: number;
  /** int 一律 1（不接受小數）；rate 為 `any`（可填小數） */
  step?: number | 'any';
  /** rate 專用：0 可不可以（0 等於把該項關掉，有些項關不得） */
  allowZero?: boolean;
  options?: readonly string[];
}

interface KeySpec<K extends keyof ServerConfig> {
  key: string;
  field: K;
  timing: ApplyTiming;
  ui: FieldUi;
  default: (dataDir: string) => ServerConfig[K];
  parse: (raw: string, dataDir: string) => ServerConfig[K];
  format: (value: ServerConfig[K]) => string;
}

/** 倍率：可填小數、不可為負；`allowZero` 為 false 時連 0 都不行（0 會讓該項完全消失） */
const rateUi = (allowZero: boolean): FieldUi => ({ kind: 'rate', min: 0, step: 'any', allowZero });
const intUi = (min: number, max: number): FieldUi => ({ kind: 'int', min, max, step: 1 });

function parseInt10(raw: string, key: string, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${key}: 必須是 ${min}~${max} 的整數（收到 "${raw}"）`);
  return n;
}

function parseRate(raw: string, key: string, allowZero: boolean): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n <= 0)) {
    throw new Error(`${key}: 必須是${allowZero ? ' ≥ 0' : ' > 0'} 的數值（收到 "${raw}"）`);
  }
  return n;
}

function parseBool(raw: string, key: string): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${key}: 必須是 true 或 false（收到 "${raw}"）`);
}

const str = (v: string) => v;
const num = (v: number) => String(v);
const spec = <K extends keyof ServerConfig>(s: KeySpec<K>) => s as unknown as KeySpec<keyof ServerConfig>;

export const CONFIG_SPECS: ReadonlyArray<KeySpec<keyof ServerConfig>> = [
  spec<'serverName'>({ key: 'server-name', field: 'serverName', timing: 'live', ui: { kind: 'text' }, default: () => 'MayanaIdle', parse: str, format: str }),
  spec<'bind'>({ key: 'bind', field: 'bind', timing: 'restart', ui: { kind: 'text' }, default: () => '127.0.0.1', parse: (raw) => {
    if (!raw.trim()) throw new Error('bind: 不可為空');
    return raw.trim();
  }, format: str }),
  spec<'port'>({ key: 'port', field: 'port', timing: 'restart', ui: intUi(1, 65535), default: () => 25580, parse: (raw) => parseInt10(raw, 'port', 1, 65535), format: num }),
  spec<'maxPlayers'>({ key: 'max-players', field: 'maxPlayers', timing: 'live', ui: intUi(1, 100000), default: () => 50, parse: (raw) => parseInt10(raw, 'max-players', 1, 100000), format: num }),
  spec<'registration'>({ key: 'registration', field: 'registration', timing: 'live', ui: { kind: 'enum', options: ['open', 'invite', 'closed'] }, default: () => 'open', parse: (raw) => {
    if (raw === 'open' || raw === 'invite' || raw === 'closed') return raw;
    throw new Error(`registration: 必須是 open／invite／closed（收到 "${raw}"）`);
  }, format: str }),
  spec<'inviteCode'>({ key: 'invite-code', field: 'inviteCode', timing: 'live', ui: { kind: 'text' }, default: () => '', parse: str, format: str }),
  spec<'adminUser'>({ key: 'admin-user', field: 'adminUser', timing: 'live', ui: { kind: 'text' }, default: () => 'admin', parse: str, format: str }),
  spec<'adminPassword'>({ key: 'admin-password', field: 'adminPassword', timing: 'live', ui: { kind: 'password' }, default: () => '', parse: str, format: str }),
  spec<'autoOpenBrowser'>({ key: 'auto-open-browser', field: 'autoOpenBrowser', timing: 'restart', ui: { kind: 'bool' }, default: () => true, parse: (raw) => parseBool(raw, 'auto-open-browser'), format: (v) => String(v) }),
  spec<'backupDir'>({ key: 'backup-dir', field: 'backupDir', timing: 'live', ui: { kind: 'path' }, default: (dataDir) => join(dataDir, 'backups'), parse: str, format: str }),
  spec<'goldRate'>({ key: 'gold-rate', field: 'goldRate', timing: 'live', ui: rateUi(true), default: () => 1, parse: (raw) => parseRate(raw, 'gold-rate', true), format: num }),
  spec<'dropRate'>({ key: 'drop-rate', field: 'dropRate', timing: 'live', ui: rateUi(true), default: () => 1, parse: (raw) => parseRate(raw, 'drop-rate', true), format: num }),
  spec<'expRate'>({ key: 'exp-rate', field: 'expRate', timing: 'live', ui: rateUi(true), default: () => 1, parse: (raw) => parseRate(raw, 'exp-rate', true), format: num }),
  spec<'pressureRate'>({ key: 'pressure-rate', field: 'pressureRate', timing: 'live', ui: rateUi(true), default: () => 1, parse: (raw) => parseRate(raw, 'pressure-rate', true), format: num }),
  spec<'spawnRate'>({ key: 'spawn-rate', field: 'spawnRate', timing: 'live', ui: rateUi(false), default: () => 1, parse: (raw) => parseRate(raw, 'spawn-rate', false), format: num }),
  spec<'monsterHpRate'>({ key: 'monster-hp-rate', field: 'monsterHpRate', timing: 'live', ui: rateUi(false), default: () => 1, parse: (raw) => parseRate(raw, 'monster-hp-rate', false), format: num }),
  spec<'monsterAttackRate'>({ key: 'monster-attack-rate', field: 'monsterAttackRate', timing: 'live', ui: rateUi(false), default: () => 1, parse: (raw) => parseRate(raw, 'monster-attack-rate', false), format: num }),
  spec<'bossSpawnRate'>({ key: 'boss-spawn-rate', field: 'bossSpawnRate', timing: 'live', ui: rateUi(true), default: () => 1, parse: (raw) => parseRate(raw, 'boss-spawn-rate', true), format: num }),
];

export const CONFIG_FILE = 'server.properties';

export interface LoadedConfig {
  config: ServerConfig;
  warnings: string[];
  /** 這次補寫回檔案的鍵 */
  filled: string[];
}

export function parseProperties(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return map;
}

export function formatProperties(config: ServerConfig): string {
  const lines = ['# MayanaIdle server.properties（docs/design/97-selfhosted-server.md § 97.2）'];
  for (const s of CONFIG_SPECS) {
    lines.push(`${s.key}=${s.format(config[s.field] as never)}`);
  }
  return lines.join('\n') + '\n';
}

export function buildConfig(entries: Map<string, string>, dataDir: string): LoadedConfig {
  const config = {} as ServerConfig;
  const warnings: string[] = [];
  const filled: string[] = [];
  const known = new Set(CONFIG_SPECS.map(s => s.key));
  for (const key of entries.keys()) {
    if (!known.has(key)) warnings.push(`忽略未知的鍵 "${key}"`);
  }
  for (const s of CONFIG_SPECS) {
    const raw = entries.get(s.key);
    if (raw === undefined) {
      (config as unknown as Record<string, unknown>)[s.field] = s.default(dataDir);
      filled.push(s.key);
    } else {
      (config as unknown as Record<string, unknown>)[s.field] = s.parse(raw, dataDir);
    }
  }
  return { config, warnings, filled };
}

export function loadConfig(dataDir: string): LoadedConfig {
  const path = join(dataDir, CONFIG_FILE);
  const text = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const loaded = buildConfig(parseProperties(text), dataDir);
  if (loaded.filled.length > 0) writeFileSync(path, formatProperties(loaded.config));
  return loaded;
}

export function saveConfig(dataDir: string, config: ServerConfig): void {
  writeFileSync(join(dataDir, CONFIG_FILE), formatProperties(config));
}

export function isLoopbackBind(bind: string): boolean {
  return bind === '127.0.0.1' || bind === 'localhost' || bind === '::1';
}

export function timingOf(key: string): ApplyTiming | null {
  return CONFIG_SPECS.find(s => s.key === key)?.timing ?? null;
}
