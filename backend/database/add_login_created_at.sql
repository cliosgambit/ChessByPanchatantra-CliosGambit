-- Adds created_at to Login for player registration dates (used by dashboard + profile).
ALTER TABLE "Login" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
UPDATE "Login" SET created_at = NOW() WHERE created_at IS NULL;

-- Optional manual cleanup if users table still exists after backend migration:
-- DROP TABLE IF EXISTS users CASCADE;
