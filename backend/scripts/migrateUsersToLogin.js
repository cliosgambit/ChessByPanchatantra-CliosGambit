const bcrypt = require('bcrypt');
const db = require('../api/config/database');
const { addColumnIfNotExists, tableHasColumn, sqlite } = require('../api/config/database');

const SALT_ROUNDS = 10;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$/;

async function hashPassword(password) {
  if (!password) return null;
  if (BCRYPT_HASH_REGEX.test(password)) return password;
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function usersTableExists() {
  const { rows } = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'
    ) AS "exists"
  `);
  return Boolean(rows[0]?.exists);
}

/** Rebuild Login without Chess_com_ID; keep existing rows by email. */
async function migrateLoginDropChessComId() {
  if (!tableHasColumn('Login', 'Chess_com_ID')) {
    return;
  }

  const { rows: existing } = await db.query(
    `SELECT "Player_Name", email, password, "Role", otp, otp_expires_at, created_at
     FROM "Login"`
  );

  sqlite.exec('PRAGMA foreign_keys = OFF;');
  sqlite.exec('BEGIN;');
  try {
    sqlite.exec('DROP TABLE IF EXISTS "Login";');
    sqlite.exec(`
      CREATE TABLE "Login" (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        "Player_Name"    TEXT,
        email            TEXT UNIQUE NOT NULL,
        password         TEXT,
        "Role"           TEXT DEFAULT 'student',
        otp              TEXT,
        otp_expires_at   TEXT,
        created_at       TEXT DEFAULT (datetime('now'))
      );
    `);

    const insert = sqlite.prepare(
      `INSERT INTO "Login" ("Player_Name", email, password, "Role", otp, otp_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    for (const row of existing) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!email) continue;
      insert.run(
        row.Player_Name || null,
        email,
        row.password || null,
        row.Role || 'student',
        row.otp || null,
        row.otp_expires_at || null,
        row.created_at || new Date().toISOString()
      );
    }

    sqlite.exec('COMMIT;');
  } catch (err) {
    try {
      sqlite.exec('ROLLBACK;');
    } catch {}
    throw err;
  } finally {
    sqlite.exec('PRAGMA foreign_keys = ON;');
  }

  console.log(`✅ Login table migrated (dropped Chess_com_ID); kept ${existing.filter((r) => r.email).length} row(s)`);
}

async function ensureLoginColumns() {
  await migrateLoginDropChessComId();
  addColumnIfNotExists('Login', 'created_at', "created_at TEXT DEFAULT (datetime('now'))");
  await db.query(`UPDATE "Login" SET created_at = datetime('now') WHERE created_at IS NULL`);
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
      `SELECT id, "Player_Name", password, "Role", created_at
       FROM "Login"
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    if (loginRows[0]) {
      const login = loginRows[0];
      const playerName =
        String(login.Player_Name || '').trim() && login.Player_Name !== email
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
      migrated += 1;
      continue;
    }

    await db.query(
      `INSERT INTO "Login" ("Player_Name", email, password, "Role", created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [fullName, email, passwordHash, role, userRow.created_at || new Date().toISOString()]
    );
    migrated += 1;
  }

  await db.query('DROP TABLE IF EXISTS users');
  return { migrated, skipped: false };
}

async function ensureDefaultAdminInLogin() {
  const adminEmail = 'admin@gmail.com';
  const { rows } = await db.query(
    `SELECT 1 FROM "Login" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [adminEmail]
  );
  if (rows[0]) return;

  const passwordHash = await hashPassword('1234');
  await db.query(
    `INSERT INTO "Login" ("Player_Name", email, password, "Role", created_at)
     VALUES ($1, $2, $3, 'admin', datetime('now'))`,
    ['Admin', adminEmail, passwordHash]
  );
  console.log('⚠️  Seeded default admin in Login: admin@gmail.com / 1234');
}

async function migrateUsersToLogin() {
  await ensureLoginColumns();
  const result = await migrateUsersIntoLogin();

  if (result.skipped) {
    console.log('✅ Login table ready (users table already removed)');
  } else {
    console.log(`✅ Migrated ${result.migrated} row(s) from users → Login and dropped users table`);
  }

  const { rows: loginCount } = await db.query(`SELECT COUNT(*) AS count FROM "Login"`);
  if ((loginCount[0]?.count || 0) === 0) {
    await ensureDefaultAdminInLogin();
  }
}

module.exports = { migrateUsersToLogin, ensureLoginColumns, migrateLoginDropChessComId };
