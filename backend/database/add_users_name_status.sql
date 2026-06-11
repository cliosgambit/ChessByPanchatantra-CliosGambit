-- Optional: align users table with admin UI columns (name, status)
-- Run in Supabase SQL Editor if your table only has full_name / is_active

ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';

UPDATE users
SET name = full_name
WHERE name IS NULL AND full_name IS NOT NULL;

UPDATE users
SET status = CASE WHEN is_active = FALSE THEN 'PAUSED' ELSE 'ACTIVE' END
WHERE status IS NULL;
