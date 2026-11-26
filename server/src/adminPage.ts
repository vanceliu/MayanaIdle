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
  --accent-mana: #3280FF;
  --star-str: #ff4d4d; --star-agi: #3ccf6e; --star-int: #3d6bff;
  --star-spi: #8fd3ff; --star-vit: #ff8fc8; --star-other: #f2f2f7;
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
h2 { font-size: 15px; margin: 16px 0 6px; }
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
.modal-overlay { position: fixed; inset: 0; z-index: 10; background: rgba(0, 0, 0, .6); display: flex; justify-content: center; align-items: flex-start; padding: 5vh 16px; }
.modal { width: min(760px, 100%); max-height: 90vh; display: flex; flex-direction: column; background: var(--bg-panel); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-md); }
.modal-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #262665; }
.modal-head h2 { margin: 0; }
.modal-body { padding: 10px 12px 12px; overflow: auto; }
.modal-body h3 { font-size: 14px; color: var(--accent-gold); margin: 14px 0 6px; }
.detail-top { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
.kv2 { flex: 1 1 360px; display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 4px 12px; font-size: 13px; }
.kv2 .k { color: var(--text-dim); }
.pawn svg { display: block; height: 120px; width: auto; max-width: 100%; padding: 6px; background: var(--bg-inset); border-radius: var(--radius-sm); }
.cells { display: grid; grid-template-columns: repeat(auto-fill, 56px); gap: 3px; }
.cell { position: relative; height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px 2px; overflow: hidden; background: var(--bg-inset); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-sm); }
.cell:hover { border-color: var(--accent-primary); }
.ico { display: inline-flex; width: 24px; height: 24px; }
.ico svg { width: 100%; height: 100%; }
.cell-name { font-size: 11px; line-height: 1.1; color: var(--text-secondary); white-space: nowrap; max-width: 100%; overflow: hidden; }
.cell-enh, .cell-count { position: absolute; top: 1px; font-size: 11px; padding: 0 2px; border-radius: 2px; background: rgba(0, 0, 0, .6); }
.cell-enh { left: 2px; color: var(--accent-info); }
.cell-count { right: 2px; color: var(--accent-gold); font-weight: 600; }
.tip { position: fixed; z-index: 20; display: none; flex-direction: column; align-items: flex-start; gap: 2px; max-width: 320px; padding: 8px 10px; font-size: 13px; pointer-events: none; background: var(--bg-card); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-sm); box-shadow: 0 4px 12px rgba(0, 0, 0, .5); }
.tip .tip-name { font-weight: 600; }
.tip .equipped { color: var(--accent-info); font-size: 12px; }
.tip .slot { color: var(--text-dim); font-size: 12px; }
.tip .tier, .tip .count { font-size: 12px; }
.tip .tip-stat { color: var(--accent-info); font-size: 12px; }
.tip .usage { color: var(--accent-gold); font-size: 12px; }
.tip .max-roll { font-weight: 700; }
.tip .affix { font-size: 12px; padding: 1px 4px; border-radius: 3px; background: var(--bg-inset); margin-top: 2px; }
.tip .affix.tier-1 { color: #6B7280; }
.tip .affix.tier-2 { color: #9CA3AF; }
.tip .affix.tier-3 { color: #4ADE80; }
.tip .affix.tier-4 { color: #FACC15; }
.tip .affix.tier-5 { color: #FB923C; }
.tip .affix.tier-6 { color: #EF4444; }
.tip .affix.tier-7 { color: #A855F7; text-shadow: 0 0 6px rgba(168, 85, 247, .3); }
.tip .affix.special { color: #FFD700; font-weight: 700; }
.tip .affix.unique { color: #A855F7; font-weight: 700; }
.tip .affix.ability { color: #86EFAC; font-weight: 700; }
.tip .affix.empty-socket { color: var(--text-dim); background: transparent; border: 1px dashed var(--outline-dark); }
.tip .affix.broken-socket { color: var(--text-dim); background: transparent; text-decoration: line-through; opacity: .6; }
.tip .affix.sealed { outline: 1px solid currentColor; outline-offset: -1px; }
.star-bar { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.star-bar b { color: var(--text-primary); font-weight: 600; }
.star-wrap { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
.star-board { flex: 1 1 360px; max-width: 520px; aspect-ratio: 1; background: var(--bg-inset); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-sm); }
.star-board svg { display: block; width: 100%; height: 100%; }
.star-sum { flex: 1 1 200px; font-size: 13px; }
.star-sum h4 { font-size: 12px; font-weight: 500; color: var(--text-secondary); margin: 6px 0 2px; }
.star-sum h4:first-child { margin-top: 0; }
.star-sum ul, .tip ul { padding-left: 18px; line-height: 1.7; }
.star-v { color: #FACC15; }
.inert { color: var(--text-dim); text-decoration: line-through; }
.star-edge { stroke: var(--text-dim); stroke-opacity: .45; stroke-width: 4; }
.star-edge.is-allocated { stroke: var(--accent-gold); stroke-opacity: 1; stroke-width: 8; }
.star-dot { fill-opacity: .55; stroke: var(--text-dim); stroke-width: 3; }
.kind-keystone .star-dot { stroke: var(--accent-mana); stroke-width: 5; }
.kind-start .star-dot { stroke-width: 5; }
.is-own-start .star-dot { stroke: var(--accent-primary); }
.is-allocated .star-dot { fill-opacity: 1; stroke: var(--accent-gold); stroke-width: 6; }
.star-node:hover .star-dot { stroke: var(--text-primary); }
.star-halo { fill: none; stroke: var(--accent-mana); stroke-width: 2; stroke-dasharray: 4 4; }
.star-hit { fill: transparent; }
.star-label { fill: var(--text-primary); text-anchor: middle; pointer-events: none; paint-order: stroke; stroke: var(--bg-inset); stroke-width: 10px; }
.tip .star-kind { color: var(--text-dim); font-size: 12px; font-weight: 400; margin-left: 8px; }
.tip .star-status { color: var(--accent-gold); font-size: 12px; }
.stat-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
.stat-group { background: var(--bg-inset); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-sm); padding: 6px 10px; font-size: 13px; }
.stat-group h4 { font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-bottom: 2px; }
.stat-row { display: flex; justify-content: space-between; gap: 8px; line-height: 1.7; }
.stat-row .k { color: var(--text-dim); cursor: help; }
.stat-row:hover .k { color: var(--accent-primary); }
.stat-row .v { font-family: ui-monospace, monospace; }
.stat-overflow { color: #F59E0B; }
.stat-overweight { color: #EF4444; }
.tip .stat-tip-title { color: var(--accent-primary); font-weight: 600; }
.tip .stat-tip-formula, .tip .stat-tip-note { margin-top: 4px; font-size: 12px; color: var(--text-secondary); }
.skill-cells { grid-template-columns: repeat(auto-fill, 64px); }
.skill-cells .cell { height: 60px; }
.cell-star { position: absolute; top: 1px; right: 2px; font-size: 10px; color: var(--accent-gold); font-weight: 600; }
h4.sub { font-size: 12px; font-weight: 500; color: var(--text-secondary); margin: 10px 0 0; }
h3 .hint { font-size: 12px; font-weight: 400; margin-left: 6px; }
.quick-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 3px; margin-top: 8px; font-size: 12px; }
.quick-slot { display: flex; gap: 6px; align-items: center; padding: 3px 6px; background: var(--bg-inset); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-sm); overflow: hidden; white-space: nowrap; }
.quick-slot .key { color: var(--text-dim); font-family: ui-monospace, monospace; }
.quick-slot.empty { color: var(--text-dim); }
.tip .skill-cat, .tip .skill-lv { color: var(--text-dim); font-size: 12px; }
.tip .skill-line { font-size: 12px; }
.stat-changed { color: #FACC15; font-weight: 700; }
.skill-tag-list { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 4px; margin: 2px 0 4px; font-size: 11px; }
.skill-tag-label { color: var(--text-dim); margin-right: 2px; }
.skill-tag { padding: 0 5px; border-radius: 3px; line-height: 1.6; white-space: nowrap; background: rgba(148, 163, 184, .18); color: #CBD5E1; }
.skill-tag-fire { background: rgba(220, 38, 38, .2); color: #F87171; }
.skill-tag-ice { background: rgba(59, 130, 246, .2); color: #60A5FA; }
.skill-tag-wind { background: rgba(34, 197, 94, .2); color: #4ADE80; }
.skill-tag-earth { background: rgba(217, 119, 6, .2); color: #FBBF24; }
.skill-tag-light { background: rgba(250, 204, 21, .2); color: #FDE047; }
.skill-tag-dark { background: rgba(139, 92, 246, .2); color: #A78BFA; }
.skill-tag.changed { color: #FACC15; box-shadow: inset 0 0 0 1px #FACC15; font-weight: 700; }
.talent-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.talent-tabs button { padding: 3px 10px; font-size: 12px; }
.talent-tabs button.on { border-color: var(--accent-primary); color: var(--text-primary); }
.talent-tabs .using { color: var(--accent-gold); margin-left: 4px; }
.talent-page { display: none; }
.talent-page.on { display: block; }
.talent-page h4 { font-size: 12px; font-weight: 500; color: var(--text-secondary); margin: 8px 0 4px; }
.talent-slot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 4px 6px; margin-bottom: 3px; font-size: 12px; background: var(--bg-inset); border: var(--border-width) solid var(--outline-dark); border-radius: var(--radius-sm); }
.talent-slot.off { opacity: .5; }
.talent-slot .no { color: var(--text-dim); font-family: ui-monospace, monospace; min-width: 44px; }
.talent-entry { padding: 1px 6px; border-radius: 3px; background: var(--bg-card); border: 1px solid var(--outline-dark); }
.talent-entry.act { border-color: var(--accent-primary); }
.talent-entry.empty { color: var(--text-dim); border-style: dashed; }
.talent-entry .p { color: var(--text-dim); margin-left: 4px; }
.talent-arrow { color: var(--text-dim); }
.talent-off { color: var(--text-dim); margin-left: auto; }
.talent-settings { margin-top: 8px; font-size: 12px; color: var(--text-secondary); line-height: 1.7; }
.talent-settings b { color: var(--text-dim); font-weight: 500; margin-right: 6px; }
details { margin-top: 14px; }
details summary { cursor: pointer; color: var(--text-dim); font-size: 12px; margin-bottom: 6px; }
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
    if (S.tab === 'users') S.data.allowlist = (await api('ip-allowlist')).entries;
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
        (p.userId ? ' <button class="danger" onclick="doBan(' + p.userId + ')">封鎖</button>' : '') +
        (p.characterId
          ? (p.mutedUntil
            ? ' <button onclick="doUnmute(' + p.characterId + ')">解除禁言</button>'
            : ' <button class="danger" onclick="doMute(' + p.characterId + ')">禁言</button>')
          : '') + '</td></tr>').join('') + '</table>';
  }
  if (S.tab === 'users') {
    const d = S.data.users; if (!d) return '載入中…';
    return '<div class="hint">這裡管的是**玩家**的遊戲帳號。管理介面自己的帳號密碼在 server.properties。</div>' +
      '<div class="row"><span>註冊開關</span><select id="reg">' +
      ['open', 'invite', 'closed'].map(v => '<option value="' + v + '"' + (d.registration === v ? ' selected' : '') + '>' + v + '</option>').join('') +
      '</select><button onclick="doRegistration()">儲存</button>' +
      '<span class="hint">與設定頁的 registration 是同一個鍵</span></div>' +
      allowlistSection() +
      '<h2>帳號</h2>' +
      '<table><tr><th>ID</th><th>帳號</th><th>角色數</th><th>狀態</th><th></th></tr>' +
      d.users.map(u => '<tr><td>' + u.id + '</td><td>' + esc(u.username) + '</td>' +
        '<td>' + u.characters + '</td>' +
        '<td>' + (u.online ? '<span class="pill on">在線</span> ' : '') +
        (u.bannedUntil ? '<span class="pill warn">封鎖中</span>' : '') +
        (u.hasPassword ? '' : ' <span class="pill">未設密碼</span>') +
        (u.hasPassword && !u.hasRecoveryCode ? ' <span class="pill">無救援碼</span>' : '') + '</td>' +
        '<td>' + (u.hasPassword ? '<button onclick="doIssueRecoveryCode(' + u.id + ')">發救援碼</button> ' : '') +
        (u.bannedUntil ? '<button onclick="doUnban(' + u.id + ')">解除封鎖</button>' : '<button class="danger" onclick="doBan(' + u.id + ')">封鎖</button>') +
        '</td></tr>').join('') + '</table>';
  }
  if (S.tab === 'characters') {
    const list = S.data.characters || [];
    return '<div class="row"><input id="q" placeholder="搜尋角色名稱"><button onclick="doSearch()">搜尋</button></div>' +
      '<table><tr><th>ID</th><th>名稱</th><th>職業</th><th>等級</th><th>位置</th><th>金幣</th><th></th></tr>' +
      list.map(c => '<tr><td>' + c.id + '</td><td>' + esc(c.name) + '</td><td>' + esc(c.className) + '</td><td>' + c.level + '</td>' +
        '<td>' + esc(c.regionId) + '</td><td>' + c.gold + '</td>' +
        '<td><button onclick="doDetail(' + c.id + ')">查看</button></td></tr>').join('') + '</table>';
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

function allowlistSection() {
  const list = S.data.allowlist || [];
  return '<h2>同 IP 放行名單</h2>' +
    '<div class="hint" style="margin-bottom:6px">同一 IP 同時在遊戲中最多 2 個帳號；名單上的 IP 不受限。IP 寫法同玩家管理的「來源」欄。</div>' +
    '<div class="row"><input id="aip" placeholder="IP（例：203.0.113.24）"><input id="anote" placeholder="備註"><button onclick="doAddAllow()">新增</button></div>' +
    (list.length
      ? '<table><tr><th>IP</th><th>備註</th><th>加入時間</th><th></th></tr>' +
        list.map((a, i) => '<tr><td>' + esc(a.ip) + '</td><td>' + esc(a.note || '-') + '</td>' +
          '<td>' + new Date(a.addedAt).toLocaleString('zh-TW', { hour12: false }) + '</td>' +
          '<td><button class="danger" onclick="doRemoveAllow(' + i + ')">移除</button></td></tr>').join('') + '</table>'
      : '<div class="hint">名單是空的</div>');
}

/** 角色查詢「查看」的彈出視窗（唯讀）；物品排成遊戲背包同款的格子，滑鼠移上去看 tooltip；點背景、關閉鈕或 Esc 關閉 */
function detailModal() {
  const d = S.data.character;
  if (!d) return '';
  const c = d.character;
  const v = d.view;
  const items = v.items;
  const time = (t) => (t ? new Date(t).toLocaleString('zh-TW') : '-');
  const kv = (k, val) => '<div class="k">' + k + '</div><div>' + esc(val) + '</div>';
  S.cells = [...items.equipped, ...items.bag, ...items.storage];
  let index = 0;
  const grid = (title, list) => '<h3>' + title + '（' + list.length + '）</h3>' + (list.length
    ? '<div class="cells">' + list.map(cell => itemCell(cell, index++, items.icons)).join('') + '</div>'
    : '<div class="hint">無</div>');
  const raw = Object.assign({}, d, { view: undefined });
  return '<div class="modal-overlay" onclick="if (event.target === this) closeDetail()"><div class="modal">' +
    '<div class="modal-head"><h2>' + esc(c.name) + '（唯讀）</h2><button onclick="closeDetail()">關閉</button></div>' +
    '<div class="modal-body" onscroll="hideTip()">' +
    '<div class="detail-top"><div class="kv2">' +
      kv('職業', v.className) + kv('等級', c.level) + kv('金幣', (c.gold ?? 0).toLocaleString()) + kv('經驗', c.exp) +
      (v.combat ? kv('HP 上限', v.combat.maxHp) + kv('MP 上限', v.combat.maxMp) : '') +
      kv('位置', c.regionId + (c.floor ? '（' + c.floor + 'F）' : '')) + kv('ID', c.id) + kv('帳號 ID', c.userId) + kv('UUID', c.uuid) +
      kv('建立', time(c.createdAt)) + kv('最後上線', time(c.lastSeenAt)) +
    '</div><div class="pawn">' + v.appearanceSvg + '</div></div>' +
    grid('裝備中', items.equipped) + grid('背包', items.bag) + (items.storage.length ? grid('倉庫', items.storage) : '') +
    (v.star ? starSection(v.star) : '') +
    (v.combat ? statSection(v.combat) + skillSection(v.combat) : '') +
    (v.talent ? talentSection(v.talent) : '') +
    '<h3>統計</h3><div class="grid">' + v.statistics.map(st => '<div class="stat"><div class="k">' + esc(st.label) + '</div><div class="v">' +
      Number(st.value).toLocaleString() + '</div></div>').join('') + '</div>' +
    '<details><summary>原始資料</summary><pre>' + esc(JSON.stringify(raw, null, 2)) + '</pre></details>' +
    '</div></div></div><div id="tip" class="tip"></div>';
}

/** 星盤（唯讀）：點數列、盤面、加成合計；滑鼠移到節點看名稱與效果 */
function starSection(star) {
  S.starTips = star.tips;
  const head = '<h3>星盤</h3>';
  if (!star.unlocked) return head + '<div class="hint">Lv' + star.unlockLevel + ' 開放星盤</div>';
  const summary = star.summary.length
    ? star.summary.map(g => '<h4>' + esc(g.title) + '</h4><ul>' + g.lines.map(starLine).join('') + '</ul>').join('')
    : '<div class="hint">尚未配點</div>';
  return head +
    '<div class="star-bar"><span>已用 <b>' + star.used + '</b>／' + star.total + ' 點</span>' +
    '<span>命星 <b>' + star.keystones + '</b>／' + star.keystoneCap + '</span></div>' +
    '<div class="star-wrap"><div class="star-board" onmouseover="showStarTip(event)" onmouseout="hideTip()">' + star.svg + '</div>' +
    '<div class="star-sum">' + summary + '</div></div>';
}

function starLine(l) {
  const value = l.value ? '<span class="star-v">' + esc(l.value) + '</span>' : '';
  const text = l.bracket ? esc(l.text) + '(' + value + ')' : esc(l.text) + (value ? ' ' + value : '');
  return '<li' + (l.inert ? ' class="inert"' : '') + '>' + text + (l.inert ? '（不生效）' : '') + '</li>';
}

function starTipHtml(t) {
  return '<div class="tip-name">' + esc(t.name) + '<span class="star-kind">' + esc(t.kind) + '</span></div>' +
    (t.lines.length ? '<ul>' + t.lines.map(starLine).join('') + '</ul>' : '') +
    (t.status ? '<div class="star-status">' + esc(t.status) + '</div>' : '');
}

/** 能力值（同遊戲能力值面板，不含 buff）；滑鼠移到欄位名稱看說明 */
function statSection(combat) {
  S.statTips = [];
  const row = (r) => {
    const i = S.statTips.push(r) - 1;
    const value = '<span class="' + (r.warn ? 'stat-overweight' : '') + '">' + esc(r.value) + (r.warn ? ' ⚠' : '') + '</span>' +
      (r.overflow ? '<span class="stat-overflow">（' + esc(r.overflow) + '）</span>' : '');
    return '<div class="stat-row" onmouseenter="showStatTip(event, ' + i + ')" onmouseleave="hideTip()"><span class="k">' + esc(r.label) + '</span><span class="v">' + value + '</span></div>';
  };
  return '<h3>能力值<span class="hint">（不含 buff）</span></h3><div class="stat-groups">' +
    combat.stats.map(g => '<div class="stat-group"><h4>' + esc(g.title) + '</h4>' + g.rows.map(row).join('') + '</div>').join('') + '</div>';
}

function statTipHtml(r) {
  return '<div class="stat-tip-title">' + esc(r.label) + '</div><div>' + esc(r.tip.desc) + '</div>' +
    (r.tip.formula ? '<div class="stat-tip-formula">' + esc(r.tip.formula) + '</div>' : '') +
    (r.tip.note ? '<div class="stat-tip-note">' + esc(r.tip.note) + '</div>' : '');
}

/** 已學技能（圖示、名稱、星盤等級）與快捷列；滑鼠移到技能看同遊戲的 tooltip */
function skillSection(combat) {
  S.skillTips = combat.skills.map(s => s.tip);
  const cells = combat.skills.length
    ? '<div class="cells skill-cells">' + combat.skills.map((s, i) =>
      '<div class="cell" onmouseenter="showSkillTip(event, ' + i + ')" onmouseleave="hideTip()">' +
        '<span class="ico" style="color:' + esc(s.color) + '">' + (combat.icons[s.icon] || '') + '</span>' +
        '<span class="cell-name">' + esc(s.name) + '</span>' +
        (s.star ? '<span class="cell-star">' + esc(s.star) + '</span>' : '') + '</div>').join('') + '</div>'
    : '<div class="hint">無</div>';
  const quick = '<div class="quick-slots">' + combat.quickSlots.map(q =>
    '<div class="quick-slot' + (q.name ? '' : ' empty') + '"><span class="key">' + esc(q.key) + '</span>' + esc(q.name || '—') + '</div>').join('') + '</div>';
  return '<h3>技能（' + combat.skills.length + '）</h3>' + cells + '<h4 class="sub">快捷列</h4>' + quick;
}

function partsHtml(parts) {
  return parts.map(p => (p.changed ? '<span class="stat-changed">' + esc(p.text) + '</span>' : esc(p.text))).join('');
}

function skillTipHtml(t) {
  return '<div class="tip-name">' + esc(t.name) + '</div><div class="skill-cat">' + esc(t.category) + '</div>' +
    t.tagRows.map(r => '<div class="skill-tag-list">' + (r.label ? '<span class="skill-tag-label">' + esc(r.label) + '</span>' : '') +
      r.tags.map(g => '<span class="skill-tag skill-tag-' + esc(g.tag) + (g.changed ? ' changed' : '') + '">' + esc(g.label) + '</span>').join('') + '</div>').join('') +
    '<div class="skill-lv">等級 ' + t.level + '</div>' +
    t.lines.map(l => '<div class="skill-line">' + esc(l.label) + partsHtml(l.parts) + '</div>').join('');
}

/** 天賦配置：每份一個分頁（使用中的標出），列常駐／戰鬥／補給天賦格與緊急撤退 */
function talentSection(talent) {
  const activeIndex = Math.max(0, talent.templates.findIndex(t => t.active));
  const entry = (e, cls) => e
    ? '<span class="talent-entry ' + cls + '">' + esc(e.name) + (e.params.length ? '<span class="p">' + esc(e.params.join('、')) + '</span>' : '') + '</span>'
    : '<span class="talent-entry empty ' + cls + '">' + (cls === 'act' ? '未設動作' : '空條件') + '</span>';
  const slot = (s, n) => '<div class="talent-slot' + (s.enabled ? '' : ' off') + '"><span class="no">#' + n + ' T' + s.tier + '</span>' +
    s.conditions.map(c => entry(c, 'cond')).join('') + '<span class="talent-arrow">→</span>' + entry(s.action, 'act') +
    (s.enabled ? '' : '<span class="talent-off">停用</span>') + '</div>';
  const tabs = '<div class="talent-tabs">' + talent.templates.map((t, i) =>
    '<button class="' + (i === activeIndex ? 'on' : '') + '" onclick="pickTalent(this, ' + i + ')">' + esc(t.name) +
      (t.active ? '<span class="using">使用中</span>' : '') + '</button>').join('') + '</div>';
  const pages = talent.templates.map((t, i) => '<div class="talent-page' + (i === activeIndex ? ' on' : '') + '">' +
    t.types.map(g => '<h4>' + esc(g.type) + '（' + g.slots.length + '）</h4>' +
      (g.slots.length ? g.slots.map((s, k) => slot(s, k + 1)).join('') : '<div class="hint">無</div>')).join('') +
    '<div class="talent-settings"><div><b>緊急撤退</b>' + esc(t.retreat) + '</div></div></div>').join('');
  return '<h3>天賦配置</h3>' + tabs + pages +
    '<div class="talent-settings"><div><b>戰鬥後等待</b>' + talent.afterCombat.map(esc).join('；') + '</div>' +
    '<div><b>未安裝天賦格</b>' + talent.uninstalled + ' 格</div></div>';
}

function itemCell(cell, i, icons) {
  return '<div class="cell" onmouseenter="showTip(event, ' + i + ')" onmouseleave="hideTip()">' +
    '<span class="ico" style="color:' + esc(cell.color || 'var(--text-secondary)') + '">' + (icons[cell.icon] || '') + '</span>' +
    '<span class="cell-name">' + esc(cell.shortName) + '</span>' +
    (cell.enhancement ? '<span class="cell-enh">+' + cell.enhancement + '</span>' : '') +
    (cell.amount > 1 ? '<span class="cell-count">×' + cell.amount + '</span>' : '') + '</div>';
}

/** 同遊戲背包 tooltip：名稱（Tier 色）＋ server 組好的各行（adminItemCells.ts） */
function tipHtml(cell) {
  const color = esc(cell.color || 'var(--text-primary)');
  return '<div class="tip-name" style="color:' + color + '">' + esc(cell.name) + (cell.enhancement ? ' +' + cell.enhancement : '') + '</div>' +
    cell.tip.map(l => '<div class="' + esc(l.cls || '') + '"' + (l.cls === 'tier' ? ' style="color:' + color + '"' : '') + '>' +
      l.parts.map(p => (p.cls ? '<span class="' + esc(p.cls) + '">' + esc(p.text) + '</span>' : esc(p.text))).join('') + '</div>').join('');
}

function render() {
  el('#app').innerHTML = view() + (S.msg ? '<div class="msg' + (S.err ? ' err' : '') + '">' + esc(S.msg) + '</div>' : '') + detailModal();
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
window.doMute = (characterId) => guard(async () => {
  const minutes = Number(prompt('禁言幾分鐘？', '10'));
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  await api('mute', { characterId, minutes });
  say('已禁言角色 #' + characterId + ' ' + minutes + ' 分鐘');
  load();
});
window.doUnmute = (characterId) => guard(async () => { await api('unmute', { characterId }); say('已解除禁言'); load(); });
window.doIssueRecoveryCode = (userId) => guard(async () => {
  const username = S.data.users.users.find(u => u.id === userId).username;
  if (!confirm('發新救援碼給 ' + username + '？玩家原本的救援碼會立即失效。')) return;
  const { code } = await api('issue-recovery-code', { userId });
  say(username + ' 的救援碼：' + code + '（只顯示這一次）。請交給玩家，在登入畫面用「忘記密碼？」自行重設密碼'); load();
});
window.doRegistration = () => guard(async () => {
  await api('config/save', { values: { registration: el('#reg').value } });
  say('已更新註冊開關'); load();
});
window.doAddAllow = () => guard(async () => {
  const ip = el('#aip').value.trim();
  const existed = (S.data.allowlist || []).some(a => a.ip === ip);
  await api('ip-allowlist/add', { ip, note: el('#anote').value });
  say(existed ? '已更新 ' + ip + ' 的備註' : '已放行 ' + ip); load();
});
window.doRemoveAllow = (i) => guard(async () => {
  const ip = S.data.allowlist[i].ip;
  if (!confirm('從放行名單移除 ' + ip + '？已在遊戲中的帳號不會被踢除。')) return;
  await api('ip-allowlist/remove', { ip });
  say('已移除 ' + ip); load();
});
window.doSearch =() => guard(async () => { S.data.characters = (await api('characters?q=' + encodeURIComponent(el('#q').value))).characters; render(); });
window.doDetail = (id) => guard(async () => { S.data.character = await api('character?id=' + id); render(); });
function placeTip(html, r) {
  const tip = el('#tip');
  if (!tip) return;
  tip.innerHTML = html;
  tip.style.display = 'flex';
  const left = r.right + 8 + tip.offsetWidth > innerWidth ? r.left - 8 - tip.offsetWidth : r.right + 8;
  tip.style.left = Math.max(4, left) + 'px';
  tip.style.top = Math.max(4, Math.min(r.top, innerHeight - tip.offsetHeight - 4)) + 'px';
}
window.showTip = (event, i) => { if (S.cells[i]) placeTip(tipHtml(S.cells[i]), event.currentTarget.getBoundingClientRect()); };
window.showStarTip = (event) => {
  const node = event.target.closest('[data-n]');
  const t = node && S.starTips && S.starTips[Number(node.dataset.n)];
  if (t) placeTip(starTipHtml(t), node.querySelector('.star-dot').getBoundingClientRect());
};
window.showStatTip = (event, i) => { if (S.statTips[i]) placeTip(statTipHtml(S.statTips[i]), event.currentTarget.getBoundingClientRect()); };
window.showSkillTip = (event, i) => { if (S.skillTips[i]) placeTip(skillTipHtml(S.skillTips[i]), event.currentTarget.getBoundingClientRect()); };
window.pickTalent = (button, i) => {
  const section = button.parentElement;
  section.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
  let page = section.nextElementSibling;
  for (let k = 0; page && page.classList.contains('talent-page'); k++, page = page.nextElementSibling) page.classList.toggle('on', k === i);
};
window.hideTip = () => { const tip = el('#tip'); if (tip) tip.style.display = 'none'; };
window.closeDetail = () => { S.data.character = null; render(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.data.character) window.closeDetail(); });
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

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function adminPage(serverName: string, version: string): string {
  const title = `${escapeHtml(serverName)} 管理介面`;
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
