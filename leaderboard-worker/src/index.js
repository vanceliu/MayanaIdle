const ALLOWED_FIELDS = [
  'character_level', 'monstersKilled', 'bossesKilled', 'deathCount',
  'equipmentCrafted', 'weaponEnhanceAttempts', 'armorEnhanceAttempts',
  'weaponsBroken', 'armorsBroken', 'questsCompleted',
  'totalGoldEarned', 'contribution'
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
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
  const result = await res.json();
  return result;
}

async function handleUpsertStats(request, env) {
  const body = await request.json();
  const { character_id, character_name, turnstile_token } = body;

  if (!turnstile_token) {
    return jsonResponse({ error: 'Turnstile token required' }, 403);
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const turnstileResult = await verifyTurnstile(turnstile_token, ip, env);
  if (!turnstileResult.success) {
    return jsonResponse({ error: 'Turnstile verification failed', details: turnstileResult }, 403);
  }

  if (!character_id || !character_name) {
    return jsonResponse({ error: 'character_id and character_name required' }, 400);
  }

  if (body.character_level == null || !body.class_name) {
    return jsonResponse({ error: 'character_level and class_name required' }, 400);
  }

  await env.MayanaidleD1.prepare(`
    INSERT INTO character_stats (
      character_id, character_name, character_level, class_name,
      monstersKilled, bossesKilled, deathCount,
      equipmentCrafted, weaponEnhanceAttempts, armorEnhanceAttempts,
      weaponsBroken, armorsBroken, questsCompleted,
      totalGoldEarned, contribution, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(character_id) DO UPDATE SET
      character_name = excluded.character_name,
      character_level = excluded.character_level,
      class_name = excluded.class_name,
      monstersKilled = excluded.monstersKilled,
      bossesKilled = excluded.bossesKilled,
      deathCount = excluded.deathCount,
      equipmentCrafted = excluded.equipmentCrafted,
      weaponEnhanceAttempts = excluded.weaponEnhanceAttempts,
      armorEnhanceAttempts = excluded.armorEnhanceAttempts,
      weaponsBroken = excluded.weaponsBroken,
      armorsBroken = excluded.armorsBroken,
      questsCompleted = excluded.questsCompleted,
      totalGoldEarned = excluded.totalGoldEarned,
      contribution = excluded.contribution,
      updated_at = datetime('now')
  `).bind(
    character_id, character_name, body.character_level ?? 0, body.class_name ?? '',
    body.monstersKilled ?? 0, body.bossesKilled ?? 0, body.deathCount ?? 0,
    body.equipmentCrafted ?? 0, body.weaponEnhanceAttempts ?? 0, body.armorEnhanceAttempts ?? 0,
    body.weaponsBroken ?? 0, body.armorsBroken ?? 0, body.questsCompleted ?? 0,
    body.totalGoldEarned ?? 0, body.contribution ?? 0
  ).run();

  return jsonResponse({ success: true });
}

async function handleGetLeaderboard(field, url, env) {
  if (!ALLOWED_FIELDS.includes(field)) {
    return jsonResponse({ error: 'Invalid field' }, 400);
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

  const results = await env.MayanaidleD1.prepare(`
    SELECT character_id, character_name, class_name, ${field}, updated_at
    FROM character_stats
    ORDER BY ${field} DESC
    LIMIT ?
  `).bind(limit).all();

  return jsonResponse({
    field,
    leaderboard: results.results.map((row, i) => ({
      rank: i + 1,
      character_id: row.character_id,
      character_name: row.character_name,
      class_name: row.class_name,
      value: row[field],
      updated_at: row.updated_at
    }))
  });
}

async function handleGetStats(characterId, env) {
  const result = await env.MayanaidleD1.prepare(
    'SELECT * FROM character_stats WHERE character_id = ?'
  ).bind(characterId).first();

  if (!result) {
    return jsonResponse({ error: 'Character not found' }, 404);
  }

  return jsonResponse(result);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/api/stats' && request.method === 'POST') {
        return await handleUpsertStats(request, env);
      }

      if (path.startsWith('/api/leaderboard/') && request.method === 'GET') {
        const field = path.split('/')[3];
        return await handleGetLeaderboard(field, url, env);
      }

      if (path.startsWith('/api/stats/') && request.method === 'GET') {
        const characterId = path.split('/')[3];
        return await handleGetStats(characterId, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
};
