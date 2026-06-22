const bcrypt = require('bcrypt');
const db = require('../api/config/database');

const SALT_ROUNDS = 10;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$/;

async function hashPassword(password) {
  if (!password) return null;
  if (BCRYPT_HASH_REGEX.test(password)) return password;
  return bcrypt.hash(password, SALT_ROUNDS);
}

function deriveChessComIdFromEmail(email, suffix = '') {
  const local = String(email || '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const base = local || 'player';
  return suffix ? `${base}_${suffix}` : base;
}

async function uniqueChessComId(email) {
  let candidate = deriveChessComIdFromEmail(email);
  let attempt = 0;

  while (attempt < 100) {
    const { rows } = await db.query(
      `SELECT 1 FROM "Login" WHERE LOWER("Chess_com_ID") = LOWER($1) LIMIT 1`,
      [candidate]
    );
    if (!rows[0]) return candidate;
    attempt += 1;
    candidate = deriveChessComIdFromEmail(email, String(attempt));
  }

  return `${deriveChessComIdFromEmail(email)}_${Date.now()}`;
}

async function syncPlayersRow(chessComId, playerName) {
  if (!chessComId || !playerName) return;
  await db.query(
    `INSERT INTO players ("Chess_com_ID", "Player_Name")
     VALUES ($1, $2)
     ON CONFLICT ("Chess_com_ID") DO UPDATE SET
       "Player_Name" = EXCLUDED."Player_Name"`,
    [chessComId, playerName]
  );
}

async function usersTableExists() {
  const { rows } = await db.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
}

async function ensureLoginColumns() {
  await db.query(
    `ALTER TABLE "Login" ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`
  );
  await db.query(`UPDATE "Login" SET created_at = NOW() WHERE created_at IS NULL`);
}

async function migrateUsersIntoLogin() {
  if (!(await usersTableExists())) {
    return { migrated: 0, skipped: true };
  }

  const { rows: usersRows } = await db.query(
    `SELECT id, full_name, email, password_hash, role, is_active, created_at FROM users`
  );

  let migrated = 0;

  for (const userRow of usersRows) {
    const email = String(userRow.email || '')
      .trim()
      .toLowerCase();
    if (!email) continue;

    const fullName = String(userRow.full_name || '').trim() || email.split('@')[0];
    const role =
      userRow.is_active === false
        ? 'paused'
        : String(userRow.role || 'student').toLowerCase();
    const passwordHash = userRow.password_hash;

    const { rows: loginRows } = await db.query(
      `SELECT "Chess_com_ID", "Player_Name", password, "Role", created_at
       FROM "Login"
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    if (loginRows[0]) {
      const login = loginRows[0];
      const playerName =
        String(login.Player_Name || '').trim() &&
        login.Player_Name !== login.Chess_com_ID
          ? login.Player_Name
          : fullName;

      await db.query(
        `UPDATE "Login"
         SET "Player_Name" = $2,
             password = COALESCE(password, $3),
             "Role" = CASE
               WHEN $4 = 'paused' THEN 'paused'
               WHEN LOWER(COALESCE("Role", '')) = 'paused' AND $4 != 'paused' THEN $4
               ELSE COALESCE(NULLIF($4, ''), "Role", 'student')
             END,
             created_at = COALESCE(created_at, $5)
         WHERE LOWER(email) = LOWER($1)`,
        [email, playerName, passwordHash, role, userRow.created_at]
      );

      await syncPlayersRow(login.Chess_com_ID, playerName);
      migrated += 1;
      continue;
    }

    const chessComId = await uniqueChessComId(email);
    await db.query(
      `INSERT INTO "Login" ("Chess_com_ID", "Player_Name", email, password, "Role", created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [chessComId, fullName, email, passwordHash, role, userRow.created_at || new Date()]
    );
    await syncPlayersRow(chessComId, fullName);
    migrated += 1;
  }

  await db.query('DROP TABLE IF EXISTS users CASCADE');
  return { migrated, skipped: false };
}

async function ensureDefaultAdminInLogin() {
  const adminEmail = 'admin@cliosgambit.local';
  const { rows } = await db.query(
    `SELECT 1 FROM "Login" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [adminEmail]
  );
  if (rows[0]) return;

  const passwordHash = await hashPassword('ChangeMe123!');
  const chessComId = await uniqueChessComId(adminEmail);
  await db.query(
    `INSERT INTO "Login" ("Chess_com_ID", "Player_Name", email, password, "Role", created_at)
     VALUES ($1, $2, $3, $4, 'admin', NOW())`,
    [chessComId, 'System Admin', adminEmail, passwordHash]
  );
  await syncPlayersRow(chessComId, 'System Admin');
  console.log(
    '⚠️  Seeded default admin in Login: admin@cliosgambit.local / ChangeMe123! — change this password immediately.'
  );
}

async function migrateUsersToLogin() {
  await ensureLoginColumns();
  const result = await migrateUsersIntoLogin();

  if (result.skipped) {
    console.log('✅ Login table ready (users table already removed)');
  } else {
    console.log(`✅ Migrated ${result.migrated} row(s) from users → Login and dropped users table`);
  }

  const { rows: loginCount } = await db.query(`SELECT COUNT(*)::int AS count FROM "Login"`);
  if ((loginCount[0]?.count || 0) === 0) {
    await ensureDefaultAdminInLogin();
  }
}

module.exports = { migrateUsersToLogin, ensureLoginColumns };
