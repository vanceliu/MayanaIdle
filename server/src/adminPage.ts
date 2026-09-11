/**
 * 管理介面的頁面（`97-selfhosted-server.md` § 97.8）。單一 HTML，沿用遊戲的 CSS 設計 token。
 *
 * 不用打包器：這頁只有表格與表單，接的是 `/admin/api/*`。
 * 版面規則沿用 `34-ui-guidelines.md`：分頁列在上、內容區捲動、動作鈕在列上。
 */

const STYLE = `
:root {
  --bg-deepest: #08081C;
  --bg-panel: #0E0E2F;
  --bg-card: #161648;
  --bg-inset: #05051D;
  --accent-primary: #A586FF;
  --accent-danger: #FF3457;
  --accent-success: #0ADD58;
  --accent-gold: #FFA101;
  --accent-info: #00BADA;
  --text-primary: #E2E8F0;
  --text-secondary: #94A3B8;
  --text-dim: #8A99B5;
  --border-width: 1.75px;
  --outline-dark: #4A4585;
  --radius-sm: 5px;
  --radius-md: 10px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg-deepest);
  color: var(--text-primary);
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  padding: 16px;
}
h1 { font-size: 18px; margin-bottom: 4px; }
.sub { color: var(--text-dim); font-size: 12px; margin-bottom: 12px; }
.tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; }
.tab, button {
  padding: 5px 12px;
  border: var(--border-width) solid var(--outline-dark);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.tab.active { background: color-mix(in srgb, var(--accent-primary) 42%, var(--bg-card)); border-color: var(--accent-primary); font-weight: 600; }
button.danger { border-color: var(--accent-danger); color: var(--accent-danger); background: transparent; }
button:disabled { opacity: .45; cursor: default; }
.panel { background: var(--bg-panel); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-md); padding: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.stat { background: var(--bg-card); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-sm); padding: 8px 10px; }
.stat .k { color: var(--text-dim); font-size: 12px; }
.stat .v { color: var(--accent-gold); font-size: 16px; font-family: ui-monospace, monospace; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #262665; vertical-align: middle; }
th { color: var(--text-secondary); font-weight: 500; }
input, select {
  background: var(--bg-inset); color: var(--text-primary);
  border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-sm);
  padding: 4px 8px; font: inherit; font-size: 13px;
}
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.msg { margin-top: 10px; padding: 6px 10px; border-left: 3px solid var(--accent-gold); color: var(--accent-gold); }
.msg.err { border-color: var(--accent-danger); color: var(--accent-danger); }
.hint { color: var(--text-dim); font-size: 12px; }
.pill { font-size: 12px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--outline-dark); color: var(--text-dim); }
.pill.on { color: var(--accent-success); border-color: var(--accent-success); }
.pill.warn { color: var(--accent-danger); border-color: var(--accent-danger); }
.login { max-width: 320px; display: flex; flex-direction: column; gap: 8px; }
pre { background: var(--bg-inset); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-sm); padding: 8px; overflow: auto; max-height: 40vh; font-size: 12px; }
`;

const SCRIPT = String.raw`
const S = { token: localStorage.getItem('mayana.adminToken'), tab: 'status', data: {}, msg: null, err: false };
const el = (q) => document.querySelector(q);

async function api(path, body, method) {
  const res = await fetch('/admin/api/' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: Object.assign({ 'content-type': 'application/json' }, S.token ? { authorization: 'Bearer ' + S.token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

function say(text, isError) { S.msg = text; S.err = !!isError; render(); }

async function guard(fn) {
  try { await fn(); } catch (e) {
    if (String(e.message).includes('登入')) { S.token = null; localStorage.removeItem('mayana.adminToken'); }
    say(e.message, true);
  }
}

const TABS = [
  ['status', '狀態總覽'], ['players', '玩家管理'], ['users', '帳號管理'],
  ['characters', '角色查詢'], ['mail', '信箱補償'], ['backup', '備份'], ['config', '設定'],
];

async function load() {
  if (!S.token) return render();
  await guard(async () => {
    if (S.tab === 'status') S.data.status = await api('status');
    if (S.tab === 'players') S.data.players = (await api('players')).players;
    if (S.tab === 'users' || S.tab === 'mail') S.data.users = await api('users');
    if (S.tab === 'characters' || S.tab === 'mail') S.data.characters = (await api('characters')).characters;
    if (S.tab === 'config') S.data.config = (await api('config')).keys;
    render();
  });
}

function esc(v) { return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function bytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB'; }

function view() {
  if (!S.token) {
    return '<div class="panel login">' +
      '<h1>管理介面登入</h1><div class="sub">帳號密碼在 server.properties 的 admin-user／admin-password，與遊戲帳號無關</div>' +
      '<input id="u" placeholder="帳號" autocomplete="username">' +
      '<input id="p" type="password" placeholder="密碼" autocomplete="current-password">' +
      '<button onclick="doLogin()">登入</button></div>';
  }
  const tabs = '<div class="tabs">' + TABS.map(t =>
    '<button class="tab' + (S.tab === t[0] ? ' active' : '') + '" onclick="go(\'' + t[0] + '\')">' + t[1] + '</button>').join('')
    + '<button onclick="doLogout()">登出</button></div>';
  return tabs + '<div class="panel">' + body() + '</div>';
}

function body() {
  if (S.tab === 'status') {
    const s = S.data.status; if (!s) return '載入中…';
    const stat = (k, v) => '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
    return '<div class="grid">' +
      stat('版本', esc(s.version)) + stat('在線玩家', s.online + ' / ' + s.maxPlayers) +
      stat('連線數', s.connections) + stat('隊伍實例', s.instances) + stat('隊伍數', s.parties) +
      stat('bind', esc(s.bind) + ':' + s.port) + stat('SQLite 檔', bytes(s.dbBytes)) +
      stat('tick 平均', s.tick.avgMs + ' ms') + stat('tick p99', s.tick.p99Ms + ' ms') +
      stat('tick 超時', s.tick.overruns) + '</div>';
  }
  if (S.tab === 'players') {
    const list = S.data.players || [];
    if (!list.length) return '<div class="hint">目前沒有連線</div>';
    return '<table><tr><th>連線</th><th>帳號</th><th>角色</th><th>位置</th><th>實例</th><th>來源</th><th></th></tr>' +
      list.map(p => '<tr><td>#' + p.connectionId + '</td><td>' + esc(p.username || '-') + '</td>' +
        '<td>' + esc(p.characterName || '-') + (p.level ? ' Lv.' + p.level : '') + '</td>' +
        '<td>' + esc(p.regionId || '-') + (p.floor != null ? ' ' + p.floor + 'F' : '') + '</td>' +
        '<td>' + esc(p.instanceKey || '-') + '</td><td>' + esc(p.remoteAddress) + '</td>' +
        '<td><button class="danger" onclick="doKick(' + p.connectionId + ')">踢除</button>' +
        (p.userId ? ' <button class="danger" onclick="doBan(' + p.userId + ')">封鎖</button>' : '') + '</td></tr>').join('') + '</table>';
  }
  if (S.tab === 'users') {
    const d = S.data.users; if (!d) return '載入中…';
    return '<div class="hint">這裡管的是**玩家**的遊戲帳號。管理介面自己的帳號密碼在 server.properties。</div>' +
      '<div class="row"><span>註冊開關</span><select id="reg">' +
      ['open', 'invite', 'closed'].map(v => '<option value="' + v + '"' + (d.registration === v ? ' selected' : '') + '>' + v + '</option>').join('') +
      '</select><button onclick="doRegistration()">儲存</button>' +
      '<span class="hint">與設定頁的 registration 是同一個鍵</span></div>' +
      '<table><tr><th>ID</th><th>帳號</th><th>角色數</th><th>狀態</th><th>新密碼</th><th></th></tr>' +
      d.users.map(u => '<tr><td>' + u.id + '</td><td>' + esc(u.username) + '</td>' +
        '<td>' + u.characters + '</td>' +
        '<td>' + (u.online ? '<span class="pill on">在線</span> ' : '') +
        (u.bannedUntil ? '<span class="pill warn">封鎖中</span>' : '') +
        (u.hasPassword ? '' : ' <span class="pill">未設密碼</span>') + '</td>' +
        '<td><input id="pw' + u.id + '" type="password" placeholder="至少 6 字"></td>' +
        '<td><button onclick="doSetPassword(' + u.id + ')">重設密碼</button> ' +
        (u.bannedUntil ? '<button onclick="doUnban(' + u.id + ')">解除封鎖</button>' : '<button class="danger" onclick="doBan(' + u.id + ')">封鎖</button>') +
        '</td></tr>').join('') + '</table>';
  }
  if (S.tab === 'characters') {
    const list = S.data.characters || [];
    const detail = S.data.character;
    return '<div class="row"><input id="q" placeholder="搜尋角色名稱"><button onclick="doSearch()">搜尋</button></div>' +
      '<table><tr><th>ID</th><th>名稱</th><th>職業</th><th>等級</th><th>位置</th><th>金幣</th><th></th></tr>' +
      list.map(c => '<tr><td>' + c.id + '</td><td>' + esc(c.name) + '</td><td>' + esc(c.className) + '</td><td>' + c.level + '</td>' +
        '<td>' + esc(c.regionId) + '</td><td>' + c.gold + '</td>' +
        '<td><button onclick="doDetail(' + c.id + ')">查看</button></td></tr>').join('') + '</table>' +
      (detail ? '<h1 style="margin-top:12px">' + esc(detail.character.name) + '（唯讀）</h1><pre>' + esc(JSON.stringify(detail, null, 2)) + '</pre>' : '');
  }
  if (S.tab === 'mail') {
    const list = S.data.characters || [];
    return '<div class="hint">首版只發天賦格（52-mailbox.md § 52.0：道具與金幣型別不做）。' +
      '同一個 sourceKey 對同一角色只會發一次。</div>' +
      '<div class="row"><input id="mtitle" placeholder="信件標題"></div>' +
      '<div class="row"><input id="mkey" placeholder="sourceKey（例：compensation-2026-09）">' +
      '<select id="mtier">' + [1, 2, 3, 4].map(t => '<option value="' + t + '">T' + t + ' 天賦格</option>').join('') + '</select>' +
      '<select id="mtarget"><option value="">全部角色</option>' +
      list.map(c => '<option value="' + c.id + '">' + esc(c.name) + '（#' + c.id + '）</option>').join('') + '</select>' +
      '<button onclick="doSendMail()">發送</button></div>';
  }
  if (S.tab === 'backup') {
    return '<div class="row"><button onclick="doBackup()">建立備份</button>' +
      '<span class="hint">WAL checkpoint 後複製到 server.properties 的 backup-dir，不停服</span></div>' +
      '<div class="row"><button class="danger" onclick="doShutdown()">graceful shutdown</button>' +
      '<span class="hint">先廣播倒數給在線玩家，時間到才關閉；<b>不可取消</b>，重新啟動要回到主機上執行</span></div>' +
      (S.data.backup ? '<div class="msg">已備份：' + esc(S.data.backup.file) + '（' + bytes(S.data.backup.bytes) + '）</div>' : '');
  }
  if (S.tab === 'config') {
    const keys = S.data.config || [];
    return '<div class="hint">server.properties 的全部鍵。標記「重啟」的鍵儲存後要重新啟動才生效。</div>' +
      '<table><tr><th>鍵</th><th>值</th><th>生效</th></tr>' +
      keys.map(k => '<tr><td>' + esc(k.key) + '</td>' +
        '<td><input id="cfg-' + esc(k.key) + '" ' + (k.key.includes('password') ? 'type="password" ' : '') + 'value="' + esc(k.value) + '"></td>' +
        '<td>' + (k.timing === 'restart' ? '<span class="pill warn">重啟</span>' : '<span class="pill on">即時</span>') + '</td></tr>').join('') +
      '</table><div class="row" style="margin-top:8px"><button onclick="doSaveConfig()">儲存</button></div>';
  }
  return '';
}

function render() {
  el('#app').innerHTML = view() + (S.msg ? '<div class="msg' + (S.err ? ' err' : '') + '">' + esc(S.msg) + '</div>' : '');
}

window.go = (tab) => { S.tab = tab; S.msg = null; S.data.character = null; load(); };
window.doLogin = () => guard(async () => {
  const r = await api('login', { username: el('#u').value, password: el('#p').value });
  S.token = r.token; localStorage.setItem('mayana.adminToken', r.token); S.msg = null; load();
});
window.doLogout = () => { S.token = null; localStorage.removeItem('mayana.adminToken'); render(); };
window.doKick = (connectionId) => guard(async () => { await api('kick', { connectionId }); say('已踢除連線 #' + connectionId); load(); });
window.doBan = (userId) => guard(async () => { const r = await api('ban', { userId }); say('已封鎖帳號 #' + userId + '（踢除 ' + r.kicked + ' 個連線）'); load(); });
window.doUnban = (userId) => guard(async () => { await api('unban', { userId }); say('已解除封鎖'); load(); });
window.doSetPassword = (userId) => guard(async () => {
  await api('set-password', { userId, password: el('#pw' + userId).value });
  say('已重設密碼，玩家下次登入生效'); load();
});
window.doRegistration = () => guard(async () => {
  await api('config/save', { values: { registration: el('#reg').value } });
  say('已更新註冊開關'); load();
});
window.doSearch = () => guard(async () => { S.data.characters = (await api('characters?q=' + encodeURIComponent(el('#q').value))).characters; render(); });
window.doDetail = (id) => guard(async () => { S.data.character = await api('character?id=' + id); render(); });
window.doSendMail = () => guard(async () => {
  const target = el('#mtarget').value;
  const r = await api('send-mail', {
    title: el('#mtitle').value, sourceKey: el('#mkey').value,
    slotTier: Number(el('#mtier').value), characterId: target ? Number(target) : null,
  });
  say('已發送 ' + r.sent + ' 封（目標 ' + r.targets + ' 個角色，重複的 sourceKey 自動跳過）');
});
window.doBackup = () => guard(async () => { S.data.backup = await api('backup', {}); say('備份完成'); });
window.doShutdown = () => guard(async () => {
  const r = await api('shutdown', {});
  say('已開始關服倒數：' + r.seconds + ' 秒後關閉，期間拒絕新連線，無法取消');
});
window.doSaveConfig = () => guard(async () => {
  const values = {};
  for (const k of S.data.config) values[k.key] = el('#cfg-' + CSS.escape(k.key)).value;
  const r = await api('config/save', { values });
  say(r.needsRestart.length ? '已儲存；下列鍵需重啟才生效：' + r.needsRestart.join('、') : '已儲存並即時生效');
  load();
});

load();
`;

export function adminPage(serverName: string, version: string): string {
  const title = `${serverName} 管理介面`;
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${title}</h1>
<div class="sub">v${version} · docs/design/97-selfhosted-server.md § 97.8</div>
<div id="app"></div>
<script>${SCRIPT}</script>
</body>
</html>`;
}
