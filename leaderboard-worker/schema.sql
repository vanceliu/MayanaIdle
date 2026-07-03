CREATE TABLE IF NOT EXISTS character_stats (
  character_id TEXT PRIMARY KEY,
  character_name TEXT NOT NULL,
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
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_monsters_killed ON character_stats(monstersKilled DESC);
CREATE INDEX IF NOT EXISTS idx_bosses_killed ON character_stats(bossesKilled DESC);
CREATE INDEX IF NOT EXISTS idx_total_gold ON character_stats(totalGoldEarned DESC);
CREATE INDEX IF NOT EXISTS idx_contribution ON character_stats(contribution DESC);
CREATE INDEX IF NOT EXISTS idx_level ON character_stats(character_level DESC);

