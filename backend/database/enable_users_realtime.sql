-- Run once in Supabase SQL Editor (Dashboard → SQL → New query)
-- Enables realtime + read access for the Users admin page

-- Allow anon/authenticated clients to read users (no password_hash exposed via select in app)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read users for admin app" ON users;
CREATE POLICY "Allow read users for admin app"
  ON users FOR SELECT
  USING (true);

-- Add users table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE users;
