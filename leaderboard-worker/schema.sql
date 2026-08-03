-- MayanaIdle 排行榜 D1 schema
-- 見 docs/design/37-statistics.md § 37.4
--
-- 重要：character_id 為客戶端產生的 UUID（crypto.randomUUID()），
-- 不可使用本機 IndexedDB 的自增 id —— 那會讓所有玩家的第一隻角色都是 "1" 而互相覆蓋。
--
-- 本表無 migration 路徑（測試階段），套用前先執行：
--   DROP TABLE IF EXISTS character_stats;
--
-- 名稱唯一性（name_key UNIQUE）與註冊／註銷端點已於「身分簡化」時移除：
-- 身分改為 uuid + 角色密鑰，名稱不再唯一，全服只剩 POST /api/stats 一個寫入端點。
-- 建立與刪除角色都是純本機行為，不寫 D1。見 37-statistics.md § 37.4.3

CREATE TABLE IF NOT EXISTS character_stats (
  character_id   TEXT PRIMARY KEY,
  -- 不要求唯一（見 19-account-character.md § 19.4），每次上傳都更新
  character_name TEXT NOT NULL,
  -- 角色密鑰的 SHA-256（hex）。客戶端建角時產生，首次寫入即綁定（TOFU），
  -- 之後所有寫入都必須相符 —— 這是 /api/stats 的所有權判定。
  -- 不可改用 character_id：它在 /api/snapshot 中公開，憑它就能覆寫別人的統計。
  -- 見 37-statistics.md § 37.4.3
  auth_token_hash TEXT NOT NULL,
  character_level INTEGER DEFAULT 0,
  class_name TEXT NOT NULL,
  -- 客戶端的 CURRENT_DATA_VERSION（config.ts）。低於 Worker 內建版本的資料視為已淘汰：
  -- 不出現在排行榜、不接受更新。玩家刪除的角色也是靠版本跳號才清掉
  -- （刪除不通知伺服端）。見 docs/design/45-legacy-archive.md § 45.4
  data_version INTEGER NOT NULL DEFAULT 0,
  monstersKilled INTEGER DEFAULT 0,
  bossesKilled INTEGER DEFAULT 0,
  deathCount INTEGER DEFAULT 0,
  equipmentCrafted INTEGER DEFAULT 0,
  weaponEnhanceAttempts INTEGER DEFAULT 0,
  armorEnhanceAttempts INTEGER DEFAULT 0,
  weaponsBroken INTEGER DEFAULT 0,
  armorsBroken INTEGER DEFAULT 0,
  questsCompleted INTEGER DEFAULT 0,
  totalGoldEarned INTEGER DEFAULT 0,
  contribution INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 12 個排行欄位皆須建 index：/api/snapshot 對每個欄位各跑一次
-- ORDER BY <field> DESC LIMIT N，沒有 index 會退化成全表排序。
-- snapshot 的每個查詢都帶 WHERE data_version = ?，故排行欄位的 index 以 data_version 開頭
CREATE INDEX IF NOT EXISTS idx_data_version ON character_stats(data_version);
CREATE INDEX IF NOT EXISTS idx_level ON character_stats(character_level DESC);
CREATE INDEX IF NOT EXISTS idx_monsters_killed ON character_stats(monstersKilled DESC);
CREATE INDEX IF NOT EXISTS idx_bosses_killed ON character_stats(bossesKilled DESC);
CREATE INDEX IF NOT EXISTS idx_death_count ON character_stats(deathCount DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_crafted ON character_stats(equipmentCrafted DESC);
CREATE INDEX IF NOT EXISTS idx_weapon_enhance ON character_stats(weaponEnhanceAttempts DESC);
CREATE INDEX IF NOT EXISTS idx_armor_enhance ON character_stats(armorEnhanceAttempts DESC);
CREATE INDEX IF NOT EXISTS idx_weapons_broken ON character_stats(weaponsBroken DESC);
CREATE INDEX IF NOT EXISTS idx_armors_broken ON character_stats(armorsBroken DESC);
CREATE INDEX IF NOT EXISTS idx_quests_completed ON character_stats(questsCompleted DESC);
CREATE INDEX IF NOT EXISTS idx_total_gold ON character_stats(totalGoldEarned DESC);
CREATE INDEX IF NOT EXISTS idx_contribution ON character_stats(contribution DESC);
