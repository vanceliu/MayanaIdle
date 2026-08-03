-- 新增 T7 掉落統計欄位（docs/design/37-statistics.md § 37.1）
--
-- 為什麼是 ALTER 而不是重跑 schema.sql：schema.sql 的建表語句是給全新資料庫用的，
-- 對已上線的表重跑要先 DROP，等於清掉所有玩家的排行榜紀錄。新增欄位不需要付這個代價。
--
-- **必須在部署新版 Worker 之前套用**：RANK_FIELDS 一旦含這兩欄，
-- /api/snapshot 就會對它們下 ORDER BY，欄位不存在時整支端點會 500。
--
--   npx wrangler d1 execute MayanaidleD1 --remote --file=migrations/001-add-tier7-loot.sql
--
-- 舊資料列的新欄位為 0，舊版客戶端也只會寫入 0 —— 兩者都不會產生錯誤的數字，
-- 因此**不需要提高 CURRENT_DATA_VERSION**（跳號會讓客戶端清掉現有角色，見 § 37.4.8）。

ALTER TABLE character_stats ADD COLUMN tier7WeaponsLooted INTEGER DEFAULT 0;
ALTER TABLE character_stats ADD COLUMN tier7ArmorsLooted INTEGER DEFAULT 0;

-- 排行欄位必須有 index：snapshot 對每個欄位各跑一次 ORDER BY <field> DESC LIMIT N
CREATE INDEX IF NOT EXISTS idx_t7_weapons ON character_stats(tier7WeaponsLooted DESC);
CREATE INDEX IF NOT EXISTS idx_t7_armors ON character_stats(tier7ArmorsLooted DESC);
