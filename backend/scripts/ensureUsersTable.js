const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('../api/config/database');

const SALT_ROUNDS = 10;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$/;

async function resolvePasswordHash(rawPassword) {
  if (!rawPassword) return null;
  const value = String(rawPassword).trim();
  if (BCRYPT_HASH_REGEX.test(value)) return value;
  return bcrypt.hash(value, SALT_ROUNDS);
}

async function ensureUsersTable() {
  const sqlPath = path.join(__dirname, '../database/create_users_table.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await db.query(sql);

  const { rows: loginRows } = await db.query(
    `SELECT "Chess_com_ID", email, password, "Role"
     FROM "Login"
     WHERE email IS NOT NULL AND password IS NOT NULL`
  );

  for (const row of loginRows) {
    const email = row.email.trim().toLowerCase();
    const fullName = row.Chess_com_ID || email.split('@')[0];
    const role = (row.Role || 'student').toLowerCase();
    const passwordHash = await resolvePasswordHash(row.password);
    if (!passwordHash) continue;

    await db.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         full_name = EXCLUDED.full_name`,
      [fullName, email, passwordHash, role]
    );
  }

  const { rows: countRows } = await db.query('SELECT COUNT(*)::int AS count FROM users');
  if (countRows[0].count === 0) {
    const defaultPassword = await bcrypt.hash('ChangeMe123!', SALT_ROUNDS);
    await db.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, TRUE)`,
      ['System Admin', 'admin@cliosgambit.local', defaultPassword, 'admin']
    );
    console.log('⚠️  Seeded default admin: admin@cliosgambit.local / ChangeMe123! — change this password immediately.');
  }

  console.log('✅ users table ready');
}

module.exports = { ensureUsersTable };
