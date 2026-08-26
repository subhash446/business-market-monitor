/**
 * All queries against `user_tokens` (Document 4 §5.1).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Only PASSWORD_RESET is used by the current codebase — EMAIL_VERIFICATION
 * remains unimplemented (FR-AUTH-08, optional/non-blocking, Document 2
 * §5.1), exactly as before this feature.
 */
const { pool } = require('../database/connection');

async function create({ userId, tokenType, tokenHash, expiresAt }) {
  await pool.execute(
    'INSERT INTO user_tokens (user_id, token_type, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [userId, tokenType, tokenHash, expiresAt]
  );
}

// "Prevent reuse of consumed/expired tokens": both conditions enforced
// directly in the query, not checked separately in application code after
// a broader fetch — a row that's expired or already consumed simply
// doesn't match, and the caller sees the same "not found" outcome either way.
async function findValidByHash(tokenHash, tokenType) {
  const [rows] = await pool.execute(
    `SELECT id, user_id FROM user_tokens
     WHERE token_hash = ? AND token_type = ? AND consumed_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash, tokenType]
  );
  return rows[0] || null;
}

async function markConsumed(tokenId) {
  await pool.execute('UPDATE user_tokens SET consumed_at = NOW() WHERE id = ?', [tokenId]);
}

// Invalidates any still-active tokens of this type for a user before a new
// one is issued — requesting a fresh reset link should make older,
// still-valid links stop working, not leave multiple simultaneously-valid
// tokens outstanding. Reuses the same "consumed" mechanism as a normal
// successful reset (Document 4 §5.1 — consumed_at is the only invalidation
// path this schema has; no separate "revoked" state was added).
async function invalidateActiveTokensForUser(userId, tokenType) {
  await pool.execute(
    `UPDATE user_tokens SET consumed_at = NOW()
     WHERE user_id = ? AND token_type = ? AND consumed_at IS NULL AND expires_at > NOW()`,
    [userId, tokenType]
  );
}

module.exports = { create, findValidByHash, markConsumed, invalidateActiveTokensForUser };
