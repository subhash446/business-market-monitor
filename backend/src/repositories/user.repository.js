/**
 * All queries against `users` (Document 4 §5.1, Migration 036).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 */
const { pool } = require('../database/connection');

async function findByEmail(email) {
  if (!email) return null;
  const [rows] = await pool.execute('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [email.trim()]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByGoogleSub(googleSub) {
  if (!googleSub) return null;
  const [rows] = await pool.execute('SELECT * FROM users WHERE google_sub = ? LIMIT 1', [googleSub]);
  return rows[0] || null;
}

async function create({
  email,
  passwordHash = null,
  fullName,
  authProvider = 'LOCAL',
  googleSub = null,
  emailVerified = 0,
}) {
  const [result] = await pool.execute(
    `INSERT INTO users (email, password_hash, full_name, auth_provider, google_sub, email_verified)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      email.toLowerCase().trim(),
      passwordHash,
      fullName,
      authProvider,
      googleSub,
      emailVerified ? 1 : 0,
    ]
  );
  return findById(result.insertId);
}

// Added for Password Reset (FR-AUTH-07)
async function updatePassword(userId, passwordHash) {
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

// Added for Google OAuth (Migration 036)
async function updateGoogleSub(userId, googleSub) {
  await pool.execute(
    'UPDATE users SET google_sub = ?, email_verified = 1 WHERE id = ?',
    [googleSub, userId]
  );
  return findById(userId);
}

// Added for Email Verification / OTP (Migration 036)
async function updateEmailVerified(userId, isVerified = 1) {
  await pool.execute(
    'UPDATE users SET email_verified = ? WHERE id = ?',
    [isVerified ? 1 : 0, userId]
  );
  return findById(userId);
}

module.exports = {
  findByEmail,
  findById,
  findByGoogleSub,
  create,
  updatePassword,
  updateGoogleSub,
  updateEmailVerified,
};
