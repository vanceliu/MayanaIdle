/**
 * 起始畫面與桌面啟動器的調校頁（`title-screen.html`）。
 *
 * - 起始畫面：掛正式元件 `TitleScreen`，狀態由按鈕切換
 * - 桌面啟動器：`desktop/ui/launcher.html` 原檔放進 iframe，`window.launcher` 換成本機假後端
 */
import { StrictMode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TitleScreen, type TitleView, type TitleScreenActions } from '../src/components/TitleScreen';
import { PATCH_NOTES } from '../src/db/seed/patchNotes';
import launcherHtml from '../../desktop/ui/launcher.html?raw';
import credits from '../../desktop/dist/credits.json';

type TitleCase = 'connecting' | 'reconnecting' | 'mismatchRelease' | 'mismatchProtocol' | 'loginForm' | 'signedInOpen' | 'signedInSolo';

const TITLE_CASES: { key: TitleCase; label: string }[] = [
  { key: 'connecting', label: '連線中' },
  { key: 'reconnecting', label: '斷線重連中' },
  { key: 'mismatchRelease', label: '版本不符（發布）' },
  { key: 'mismatchProtocol', label: '版本不符（協定）' },
  { key: 'loginForm', label: '未登入（開放）' },
  { key: 'signedInOpen', label: '已登入（開放）' },
  { key: 'signedInSolo', label: '已登入（單機）' },
];

function viewOf(key: TitleCase): TitleView {
  switch (key) {
    case 'connecting': return { kind: 'connecting' };
    case 'reconnecting': return { kind: 'reconnecting' };
    case 'mismatchRelease': return { kind: 'versionMismatch', mismatch: 'release', requiredVersion: '0.8.9' };
    case 'mismatchProtocol': return { kind: 'versionMismatch', mismatch: 'protocol', requiredVersion: null };
    case 'loginForm': return { kind: 'loginForm' };
    case 'signedInOpen': return { kind: 'signedIn', username: 'player01' };
    case 'signedInSolo': return { kind: 'signedIn', username: null };
  }
}

function useLog(): [string[], (line: string) => void] {
  const [lines, setLines] = useState<string[]>([]);
  const push = useCallback((line: string) => setLines(prev => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 200)), []);
  return [lines, push];
}

function TitleDemo() {
  const [caseKey, setCaseKey] = useState<TitleCase>('signedInOpen');
  const [registration, setRegistration] = useState<'open' | 'invite' | 'closed'>('open');
  const [serverName, setServerName] = useState('瑪雅那官方服');
  const [error, setError] = useState<string | null>(null);
  const [log, push] = useLog();

  const solo = caseKey === 'signedInSolo';
  const actions: TitleScreenActions = {
    login: (u) => push(`login ${u}`),
    register: (u, _p, invite) => push(`register ${u}${invite ? `（邀請碼 ${invite}）` : ''}`),
    recover: (code) => push(`recover ${code}`),
    enter: () => push('進入 → 角色選擇'),
    switchAccount: () => { push('切換帳號 → 登出，回到登入表單'); setCaseKey('loginForm'); },
    reload: () => push('重新整理'),
    clearError: () => setError(null),
  };

  return (
    <>
      <div className="demo-controls">
        {TITLE_CASES.map(c => (
          <button key={c.key} className={c.key === caseKey ? 'is-active' : ''} onClick={() => setCaseKey(c.key)}>{c.label}</button>
        ))}
      </div>
      <div className="demo-controls">
        <label>
          註冊模式
          <select value={registration} onChange={e => setRegistration(e.target.value as typeof registration)}>
            <option value="open">open</option>
            <option value="invite">invite</option>
            <option value="closed">closed</option>
          </select>
        </label>
        <label>
          server 名稱
          <input value={serverName} onChange={e => setServerName(e.target.value)} />
        </label>
        <button onClick={() => setError('帳號或密碼錯誤')}>顯示錯誤訊息</button>
      </div>
      <div className="demo-row">
        <div className="demo-frame">
          <TitleScreen
            view={viewOf(caseKey)}
            serverName={solo ? null : serverName || null}
            registration={registration}
            error={error}
            patchNotes={PATCH_NOTES}
            actions={actions}
          />
        </div>
        <pre className="demo-log">{log.join('\n') || '（動作紀錄）'}</pre>
      </div>
    </>
  );
}

interface DemoServerEntry { scheme: 'http' | 'https'; host: string; port: number; name: string; lastUsedAt: number }
interface DemoTarget { scheme: string; host: string; port: number }

const OFFICIAL_URL = 'https://game.lwsky.cc/MayanaIdle/';

function LauncherDemo() {
  const [official, setOfficial] = useState(true);
  const [log, push] = useLog();
  const [reloads, setReloads] = useState(0);

  const servers = useRef<DemoServerEntry[]>([
    { scheme: 'http', host: '192.168.1.10', port: 25580, name: '朋友的服', lastUsedAt: 2 },
    { scheme: 'https', host: 'mayana.example.com', port: 443, name: 'mayana.example.com:443', lastUsedAt: 1 },
  ]);

  useLayoutEffect(() => {
    const same = (e: DemoServerEntry, t: DemoTarget) => e.scheme === t.scheme && e.host === t.host && e.port === t.port;
    const log = push;
    (window as unknown as { __demoLauncher: unknown }).__demoLauncher = {
      appInfo: async () => ({ version: '0.8.8', userData: '/demo/userData' }),
      officialServer: async () => (official ? { url: OFFICIAL_URL } : null),
      listServers: async () => [...servers.current].sort((a, b) => b.lastUsedAt - a.lastUsedAt),
      forgetServer: async (t: DemoTarget) => { servers.current = servers.current.filter(e => !same(e, t)); log(`移除 ${t.scheme}://${t.host}:${t.port}`); },
      renameServer: async (t: DemoTarget, name: string) => {
        servers.current = servers.current.map(e => (same(e, t) ? { ...e, name: name.trim() || `${e.host}:${e.port}` } : e));
        log(`改名 ${t.host}:${t.port} → ${name}`);
      },
      connect: async (address: string) => {
        log(`connect ${address}`);
        if (address.includes('fail')) return { ok: false, message: `連不上 ${address}（連線逾時）` };
        log('→ 載入遊戲頁（demo 不切頁）');
        return { ok: false, message: 'demo：連線成功，正式版此時會載入遊戲頁' };
      },
      startWorld: async (kind: string, id?: string) => {
        log(`startWorld ${kind}${id ? ` ${id}` : ''}`);
        return { ok: false, message: 'demo：啟動成功，正式版此時會載入遊戲頁' };
      },
      listWorlds: async () => [
        { id: 'main', name: '我的開放世界', port: 25580, bind: '0.0.0.0', registration: 'open', hasAdminPassword: false },
      ],
      worldFields: async () => [
        { key: 'port', timing: 'restart', ui: { kind: 'int', min: 1, max: 65535 }, value: '25580' },
        { key: 'registration', timing: 'live', ui: { kind: 'enum', options: ['open', 'invite', 'closed'] }, value: 'open' },
      ],
      worldConfig: async (kind: string) => ({
        name: kind === 'solo' ? '單機' : '我的開放世界',
        dir: '/demo/userData/worlds',
        fields: [{ key: 'exp-rate', timing: 'live', ui: { kind: 'rate', allowZero: true, step: 'any' }, value: '1.0' }],
      }),
      saveWorldConfig: async () => ({ ok: true }),
      createWorld: async (name: string) => { log(`createWorld ${name}`); return { ok: true, id: 'new' }; },
      deleteWorld: async (id: string) => { log(`deleteWorld ${id}`); return { ok: true }; },
      openDataDir: async () => log('openDataDir'),
      quit: async () => log('結束 → 關閉 app'),
      credits: async () => credits,
    };
  }, [official, push]);

  const srcDoc = launcherHtml.replace('<head>', '<head><script>window.launcher = window.parent.__demoLauncher;</script>');

  return (
    <>
      <div className="demo-controls">
        <label>
          <input type="checkbox" checked={official} onChange={e => setOfficial(e.target.checked)} />
          有官方 server（<code>{OFFICIAL_URL}</code>）
        </label>
        <button onClick={() => setReloads(n => n + 1)}>重新載入啟動器</button>
      </div>
      <div className="demo-row">
        <div className="demo-frame">
          <iframe key={`${official}-${reloads}`} title="launcher" srcDoc={srcDoc} />
        </div>
        <pre className="demo-log">{log.join('\n') || '（動作紀錄）'}</pre>
      </div>
    </>
  );
}

createRoot(document.getElementById('title-root')!).render(<StrictMode><TitleDemo /></StrictMode>);
createRoot(document.getElementById('launcher-root')!).render(<StrictMode><LauncherDemo /></StrictMode>);
