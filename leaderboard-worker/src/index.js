/**
 * MayanaIdle 排行榜 API（Cloudflare Worker + D1）
 * 規格見 docs/design/37-statistics.md § 37.4
 *
 * 端點：
 *   GET  /api/snapshot?top=N       一次取回所有排行榜所需資料（14 欄位各 top-N 的聯集，去重）
 *   POST /api/stats              upsert 自己的統計（需 Turnstile + auth_token）
 *
 * **只有一個寫入端點。** 建立與刪除角色都是純本機行為，不碰 D1 ——
 * 沒有 register 就沒有要註冊的東西，也就沒有要註銷的東西。
 *
 * 角色名稱**不要求唯一**（見 19-account-character.md § 19.4）：
 * 「知道自己排名在哪」只需要客戶端比對 uuid，伺服端不必保證任何唯一性。
 * 因此不再有 /api/name-check 與 /api/character/register ——
 * 名稱唯一機制的唯一效果是擋搶名字，代價卻是一整條複雜度鏈，且擋不住
 * 真正的問題（見 handleUpsertStats 的密鑰驗證）。
 */

/**
 * 現行資料版本，必須與客戶端 `client/src/config.ts` 的 CURRENT_DATA_VERSION 一致。
 *
 * 這是「批次清理舊角色」的機制（見 docs/design/45-legacy-archive.md § 45.4）：
 * 提高版本並部署後，所有舊版本的資料立即失效 —— 不出現在排行榜、不接受更新。
 *
 * 玩家刪除角色時不會通知伺服端（刪除是純本機行為），因此榜上會留下
 * 不再更新的資料列，直到版本跳號才清掉。名稱不唯一，所以這不影響任何人取名。
 */
const CURRENT_DATA_VERSION = 3;

/** 14 個可排行的欄位。此陣列是唯一會被拼進 SQL 的來源，不接受任何外部輸入。 */
const RANK_FIELDS = [
  'character_level', 'monstersKilled', 'bossesKilled', 'deathCount',
  'equipmentCrafted', 'weaponEnhanceAttempts', 'armorEnhanceAttempts',
  'weaponsBroken', 'armorsBroken', 'questsCompleted',
  'totalGoldEarned', 'tier7WeaponsLooted', 'tier7ArmorsLooted', 'contribution',
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

/**
 * 回傳錯誤原因字串，通過則回傳 null。
 * 名稱不唯一，但格式仍必須在伺服端驗 —— 客戶端的即時提示只是 UX，
 * 擋不住直接打 API 的人塞入超長字串或控制字元把榜單版面弄壞。
 */
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

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
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
 * 14 個欄位各取 top-N，聯集去重後以 columnar 格式回傳。
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

/**
 * upsert 自己的統計（docs/design/37-statistics.md § 37.4.3）。
 *
 * **密鑰驗證是這個端點的重點**：character_id 在 /api/snapshot 中公開回傳，
 * 若 upsert 不驗證所有權，任何人都能抄一個 uuid 把他人的統計覆寫成任意值。
 * 舊版的「UPDATE-only + Turnstile」擋不住這件事 —— 名稱唯一機制只擋得住搶名字。
 *
 * 綁定採 TOFU：首次寫入時把 sha256(auth_token) 存下來，之後必須相符。
 * 整件事用單一 UPSERT 完成，ON CONFLICT 的 WHERE 就是所有權判定，
 * 因此不存在「先查再寫」的競態，也不需要交易。
 *
 * 這裡刻意不做定值時間比較：存的是 hash，就算靠時間差問出 hash 也無法反推 token
 * （需要 SHA-256 preimage）。
 */
async function handleUpsertStats(request, env) {
  const body = await request.json();
  const { character_id, character_name, class_name, auth_token, turnstile_token } = body;

  const turnstileError = await requireTurnstile(request, turnstile_token, env);
  if (turnstileError) return turnstileError;

  if (!validateCharacterId(character_id)) {
    return jsonResponse({ error: 'invalid_character_id' }, 400);
  }
  if (typeof auth_token !== 'string' || auth_token.length === 0) {
    return jsonResponse({ error: 'auth_token_required' }, 400);
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

  const columns = ['character_level', 'class_name', ...STAT_FIELDS];
  const values = [
    toCount(body.character_level),
    class_name,
    ...STAT_FIELDS.map(field => toCount(body[field])),
  ];
  const updates = columns.map(col => `${col} = excluded.${col}`).join(', ');

  const result = await env.MayanaidleD1.prepare(`
    INSERT INTO character_stats
      (character_id, character_name, auth_token_hash, data_version, ${columns.join(', ')})
    VALUES (?, ?, ?, ?, ${columns.map(() => '?').join(', ')})
    ON CONFLICT(character_id) DO UPDATE SET
      character_name = excluded.character_name,
      data_version = excluded.data_version,
      ${updates},
      updated_at = datetime('now')
    WHERE character_stats.auth_token_hash = excluded.auth_token_hash
  `).bind(
    character_id,
    character_name.normalize('NFC'),
    await sha256Hex(auth_token),
    CURRENT_DATA_VERSION,
    ...values,
  ).run();

  if (!result.meta.changes) {
    // 該 character_id 已存在但密鑰不符 —— 有人拿公開的 uuid 想覆寫他人資料
    return jsonResponse({ error: 'invalid_auth_token' }, 403);
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

      if (path === '/api/stats' && request.method === 'POST') {
        return await handleUpsertStats(request, env);
      }

      return jsonResponse({ error: 'not_found' }, 404);
    } catch (err) {
      return jsonResponse({ error: 'internal_error', message: err.message }, 500);
    }
  }
};
