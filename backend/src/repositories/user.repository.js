/**
 * All queries against `users` (Document 4 §5.1).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * `user_tokens` is intentionally NOT implemented here — it belongs to
 * Password Reset / Email Verification, both explicitly out of scope for
 * Phase 2 (Authentication only).
 */
const { pool } = require('../database/connection');

async function findByEmail(email) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ email, passwordHash, fullName }) {
  const [result] = await pool.execute(
    'INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)',
    [email, passwordHash, fullName]
  );
  return findById(result.insertId);
}

// Added for Password Reset (FR-AUTH-07) — the only place a user's
// password_hash is ever updated after registration.
async function updatePassword(userId, passwordHash) {
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

module.exports = { findByEmail, findById, create, updatePassword };
