-- Production Supabase setup: RLS, realtime, indexes, audit columns
-- Run in Supabase SQL Editor

-- ─── Realtime publications ───────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "Login";
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS players;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS players_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS player_games;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS brilliant_moves;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS module;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS chapter;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS story;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS principles;

-- ─── Read policies for admin app (anon key) ──────────────────────────
ALTER TABLE "Login" ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE module ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter ENABLE ROW LEVEL SECURITY;
ALTER TABLE story ENABLE ROW LEVEL SECURITY;
ALTER TABLE principles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read Login" ON "Login";
CREATE POLICY "Allow read Login" ON "Login" FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow read players" ON players;
CREATE POLICY "Allow read players" ON players FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow read module" ON module;
CREATE POLICY "Allow read module" ON module FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow write module admin" ON module;
CREATE POLICY "Allow write module admin" ON module FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read chapter" ON chapter;
CREATE POLICY "Allow read chapter" ON chapter FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow write chapter admin" ON chapter;
CREATE POLICY "Allow write chapter admin" ON chapter FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read story" ON story;
CREATE POLICY "Allow read story" ON story FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow write story admin" ON story;
CREATE POLICY "Allow write story admin" ON story FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read principles" ON principles;
CREATE POLICY "Allow read principles" ON principles FOR SELECT USING (true);

-- ─── Recommended indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_login_email ON "Login" (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_login_role ON "Login" ("Role");
CREATE INDEX IF NOT EXISTS idx_players_name ON players ("Player_Name");
CREATE INDEX IF NOT EXISTS idx_chapter_module ON chapter (module_id);
CREATE INDEX IF NOT EXISTS idx_story_chapter ON story (chapter_id);
CREATE INDEX IF NOT EXISTS idx_story_module ON story (module_id);
CREATE INDEX IF NOT EXISTS idx_brilliant_chess_id ON brilliant_moves (chess_com_id);
CREATE INDEX IF NOT EXISTS idx_player_games_chess_id ON player_games (chess_com_id);
CREATE INDEX IF NOT EXISTS idx_chess_puzzle_principle ON chess_puzzle (principle_id);

-- ─── Suggested audit columns (run per table as needed) ─────────────
-- ALTER TABLE module ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
-- ALTER TABLE module ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
-- ALTER TABLE module ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
