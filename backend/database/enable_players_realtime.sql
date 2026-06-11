-- Run once in Supabase SQL Editor (Dashboard → SQL → New query)
-- Enables realtime + read access for the Players / Users admin pages

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read players for admin app" ON players;
CREATE POLICY "Allow read players for admin app"
  ON players FOR SELECT
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- Optional: allow reading Login for email/role on Users page
ALTER TABLE "Login" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read login for admin app" ON "Login";
CREATE POLICY "Allow read login for admin app"
  ON "Login" FOR SELECT
  USING (true);
