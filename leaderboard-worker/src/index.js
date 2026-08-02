/**
 * MayanaIdle 排行榜 API（Cloudflare Worker + D1）
 * 規格見 docs/design/37-statistics.md § 37.4
 *
 * 端點：
 *   GET  /api/snapshot?top=N     一次取回所有排行榜所需資料（12 欄位各 top-N 的聯集，去重）
 *   GET  /api/name-check?name=   角色名稱可用性預檢（UX 用，真正的唯一性由 name_key UNIQUE 保證）
 *   POST /api/character/register 建立角色時註冊名稱（需 Turnstile），名稱重複回 409
 *   POST /api/stats              更新既有角色統計（需 Turnstile），未註冊回 404
 */

/**
 * 現行資料版本，必須與客戶端 `client/src/config.ts` 的 CURRENT_DATA_VERSION 一致。
 *
 * 這個常數是「清理舊角色」的唯一機制（見 docs/design/45-legacy-archive.md § 45.4）：
 * 提高版本並部署後，所有舊版本的資料立即失效 —— 不出現在排行榜、不佔用名稱、不接受更新。
 * 刻意不讓客戶端指定要刪哪筆資料：character_id 在 snapshot 中是公開的，
 * 若接受客戶端的刪除請求，任何人都能刪除他人的排行榜紀錄。
 */
const CURRENT_DATA_VERSION = 3;

/** 12 個可排行的欄位。此陣列是唯一會被拼進 SQL 的來源，不接受任何外部輸入。 */
const RANK_FIELDS = [
  'character_level', 'monstersKilled', 'bossesKilled', 'deathCount',
  'equipmentCrafted', 'weaponEnhanceAttempts', 'armorEnhanceAttempts',
  'weaponsBroken', 'armorsBroken', 'questsCompleted',
  'totalGoldEarned', 'contribution',
];

/** snapshot 的欄位順序（columnar 格式的 header）。character_level 已含在 RANK_FIELDS 內。 */
const SNAPSHOT_COLUMNS = ['character_id', 'character_name', 'class_name', ...RANK_FIELDS, 'updated_at'];

/** 除 character_level 外的統計欄位（POST /api/stats 更新用） */
const STAT_FIELDS = RANK_FIELDS.filter(f => f !== 'character_level');

/**
 * § 19.4 角色名稱規則：中英數 + `- _ ~ = .`，2~12 字，至少含一個中英數，禁止空白。
 * 符號可置於任意位置（含開頭與結尾）。
 * 必須與客戶端 `models/characterIdentity.ts` 的 CHARACTER_NAME_PATTERN 一致。
 */
const NAME_PATTERN = /^(?=.*[A-Za-z0-9一-龥])[A-Za-z0-9一-龥\-_~=.]{2,12}$/;

const DEFAULT_TOP = 20;
const MAX_TOP = 100;
/** snapshot 的 edge cache 秒數 */
const SNAPSHOT_CACHE_SECONDS = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { ...corsHeaders, ...extraHeaders } });
}

/** 名稱正規化：NFC 後小寫，作為唯一性判定的 key（避免 Abc / abc 併存） */
function toNameKey(name) {
  return name.normalize('NFC').toLowerCase();
}

/** 回傳錯誤原因字串，通過則回傳 null */
function validateName(name) {
  if (typeof name !== 'string') return 'invalid_name';
  const normalized = name.normalize('NFC');
  if (normalized !== name) return 'invalid_name';
  if (!NAME_PATTERN.test(normalized)) return 'invalid_name';
  return null;
}

/** character_id 必須是客戶端產生的 UUID，擋掉舊版送本機自增 id（"1"、"2"…）的請求 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateCharacterId(id) {
  return typeof id === 'string' && UUID_PATTERN.test(id);
}

/** 統計數值一律轉為非負整數，擋掉 NaN / 負數 / 浮點 / 超大值 */
function toCount(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, Number.MAX_SAFE_INTEGER);
}

async function verifyTurnstile(token, ip, env) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: token,
      remoteip: ip,
    }),
  });
  return res.json();
}

/** 通過回傳 null，失敗回傳可直接回覆的 Response */
async function requireTurnstile(request, token, env) {
  if (!token) return jsonResponse({ error: 'turnstile_required' }, 403);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const result = await verifyTurnstile(token, ip, env);
  if (!result.success) {
    return jsonResponse({ error: 'turnstile_failed', details: result['error-codes'] ?? null }, 403);
  }
  return null;
}

/**
 * 12 個欄位各取 top-N，聯集去重後以 columnar 格式回傳。
 *
 * 正確性：設回傳集合為 S，對任一欄位 f，S ⊇ f 的真實 top-N。
 * 客戶端把 S 依 f 排序取前 N 時，S 中不屬於真實 top-N 的 row 其 f 值必 ≤ 第 N 名，
 * 只會落在 N 名之後 —— 因此客戶端切出的榜單恆等於全球真實榜單，與總玩家數無關。
 *
 * 同分序必須是決定性的（`, character_id ASC`），且客戶端 buildBoard 需使用相同比較子，
 * 否則邊界名次會在 server 與 client 之間跳動。
 */
async function handleSnapshot(url, env) {
  const requested = parseInt(url.searchParams.get('top') || '', 10);
  const top = Math.min(Math.max(Number.isFinite(requested) ? requested : DEFAULT_TOP, 1), MAX_TOP);

  const columns = SNAPSHOT_COLUMNS.join(', ');
  const statements = RANK_FIELDS.map(field =>
    env.MayanaidleD1.prepare(
      `SELECT ${columns} FROM character_stats
       WHERE data_version = ?
       ORDER BY ${field} DESC, character_id ASC LIMIT ?`
    ).bind(CURRENT_DATA_VERSION, top)
  );

  const results = await env.MayanaidleD1.batch(statements);

  const byId = new Map();
  for (const result of results) {
    for (const row of result.results) {
      if (!byId.has(row.character_id)) byId.set(row.character_id, row);
    }
  }

  const rows = [...byId.values()].map(row => SNAPSHOT_COLUMNS.map(col => row[col]));

  return jsonResponse(
    { top, count: rows.length, fields: SNAPSHOT_COLUMNS, rows },
    200,
    { 'Cache-Control': `public, max-age=${SNAPSHOT_CACHE_SECONDS}` }
  );
}

async function handleNameCheck(url, env) {
  const name = url.searchParams.get('name') ?? '';
  const invalid = validateName(name);
  if (invalid) return jsonResponse({ available: false, reason: invalid });

  // 已淘汰版本的資料不佔用名稱：玩家提高資料版本後，仍拿得回自己原本的名字
  const row = await env.MayanaidleD1
    .prepare('SELECT character_id FROM character_stats WHERE name_key = ? AND data_version = ?')
    .bind(toNameKey(name), CURRENT_DATA_VERSION)
    .first();

  return jsonResponse(
    { available: !row, reason: row ? 'name_taken' : null },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

/**
 * 角色建立時註冊名稱。唯一性由 name_key 的 UNIQUE constraint 在 INSERT 當下保證，
 * /api/name-check 只是預檢 —— 兩人同時查同一個名字都會過，但只有一人 INSERT 得進去。
 */
async function handleRegister(request, env) {
  const body = await request.json();
  const { character_id, character_name, class_name, turnstile_token } = body;

  const turnstileError = await requireTurnstile(request, turnstile_token, env);
  if (turnstileError) return turnstileError;

  if (!validateCharacterId(character_id)) {
    return jsonResponse({ error: 'invalid_character_id' }, 400);
  }
  const invalidName = validateName(character_name);
  if (invalidName) return jsonResponse({ error: invalidName }, 400);
  if (!class_name || typeof class_name !== 'string') {
    return jsonResponse({ error: 'class_name_required' }, 400);
  }

  if (toCount(body.data_version) !== CURRENT_DATA_VERSION) {
    // 舊版客戶端（快取到舊 bundle）：其資料已被新版淘汰，不可再寫入
    return jsonResponse({ error: 'outdated_client', current: CURRENT_DATA_VERSION }, 409);
  }

  const name = character_name.normalize('NFC');
  const nameKey = toNameKey(name);

  // 回收已淘汰版本佔用的名稱與 id，讓玩家能沿用原本的角色名（§ 45.4）
  await env.MayanaidleD1
    .prepare('DELETE FROM character_stats WHERE (name_key = ? OR character_id = ?) AND data_version < ?')
    .bind(nameKey, character_id, CURRENT_DATA_VERSION)
    .run();

  try {
    await env.MayanaidleD1.prepare(`
      INSERT INTO character_stats (character_id, character_name, name_key, character_level, class_name, data_version)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(character_id, name, nameKey, toCount(body.character_level) || 1, class_name, CURRENT_DATA_VERSION).run();
  } catch (err) {
    const message = String(err?.message ?? '');
    if (message.includes('name_key')) {
      return jsonResponse({ error: 'name_taken' }, 409);
    }
    if (message.includes('UNIQUE') || message.includes('PRIMARY KEY')) {
      // 同一個 character_id 重送：名稱一致視為冪等成功（斷線重試 / 舊角色補註冊）
      const existing = await env.MayanaidleD1
        .prepare('SELECT name_key FROM character_stats WHERE character_id = ?')
        .bind(character_id)
        .first();
      if (existing && existing.name_key === nameKey) {
        return jsonResponse({ success: true, already_registered: true });
      }
      return jsonResponse({ error: 'character_id_taken' }, 409);
    }
    throw err;
  }

  return jsonResponse({ success: true, already_registered: false });
}

/**
 * 更新既有角色統計。刻意只做 UPDATE 不做 INSERT：
 * 若允許 upsert，未經 register 的角色就能繞過名稱唯一性檢查建立資料。
 * character_name 於此不更新 —— 名稱在註冊時固定，避免改名頂替他人。
 */
async function handleUpdateStats(request, env) {
  const body = await request.json();
  const { character_id, turnstile_token } = body;

  const turnstileError = await requireTurnstile(request, turnstile_token, env);
  if (turnstileError) return turnstileError;

  if (!validateCharacterId(character_id)) {
    return jsonResponse({ error: 'invalid_character_id' }, 400);
  }
  if (!body.class_name) {
    return jsonResponse({ error: 'class_name_required' }, 400);
  }

  if (toCount(body.data_version) !== CURRENT_DATA_VERSION) {
    return jsonResponse({ error: 'outdated_client', current: CURRENT_DATA_VERSION }, 409);
  }

  const assignments = STAT_FIELDS.map(field => `${field} = ?`).join(', ');
  const result = await env.MayanaidleD1.prepare(`
    UPDATE character_stats
    SET character_level = ?, class_name = ?, ${assignments}, updated_at = datetime('now')
    WHERE character_id = ? AND data_version = ?
  `).bind(
    toCount(body.character_level),
    body.class_name,
    ...STAT_FIELDS.map(field => toCount(body[field])),
    character_id,
    CURRENT_DATA_VERSION
  ).run();

  if (!result.meta.changes) {
    // 尚未註冊、或該筆資料屬於已淘汰的版本 → 客戶端改走 /api/character/register
    return jsonResponse({ error: 'not_registered' }, 404);
  }

  return jsonResponse({ success: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/api/snapshot' && request.method === 'GET') {
        const cache = caches.default;
        const cacheKey = new Request(url.toString(), { method: 'GET' });
        const cached = await cache.match(cacheKey);
        if (cached) return cached;

        const response = await handleSnapshot(url, env);
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      }

      if (path === '/api/name-check' && request.method === 'GET') {
        return await handleNameCheck(url, env);
      }

      if (path === '/api/character/register' && request.method === 'POST') {
        return await handleRegister(request, env);
      }

      if (path === '/api/stats' && request.method === 'POST') {
        return await handleUpdateStats(request, env);
      }

      return jsonResponse({ error: 'not_found' }, 404);
    } catch (err) {
      return jsonResponse({ error: 'internal_error', message: err.message }, 500);
    }
  }
};
