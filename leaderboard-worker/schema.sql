-- MayanaIdle 排行榜 D1 schema
-- 見 docs/design/37-statistics.md § 37.4
--
-- 重要：character_id 為客戶端產生的 UUID（crypto.randomUUID()），
-- 不可使用本機 IndexedDB 的自增 id —— 那會讓所有玩家的第一隻角色都是 "1" 而互相覆蓋。
--
-- 舊表（character_id 為本機自增值）已確認清空重建，套用前先執行：
--   DROP TABLE IF EXISTS character_stats;

CREATE TABLE IF NOT EXISTS character_stats (
  character_id   TEXT PRIMARY KEY,
  character_name TEXT NOT NULL,
  -- 正規化後的名稱（NFC + 小寫），唯一性以此欄位判定，避免 Abc / abc 併存
  name_key       TEXT NOT NULL UNIQUE,
  character_level INTEGER DEFAULT 0,
  class_name TEXT NOT NULL,
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
