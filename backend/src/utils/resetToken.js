/**
 * Password reset token generation/hashing (FR-AUTH-07, Document 4 §5.1).
 *
 * A separate, focused module from utils/hash.js — that file is
 * specifically bcrypt for human-chosen passwords ("the only module allowed
 * to touch bcrypt directly"). Reset tokens are a different concern: a
 * cryptographically random, high-entropy value, hashed with SHA-256 rather
 * than bcrypt — the standard, correct choice for this case (unlike a
 * password, a random token isn't guessable/dictionary-attackable, so a
 * slow, salted KDF isn't needed; only Node's built-in crypto module is
 * used, no new dependency).
 */
const crypto = require('crypto');

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = { generateResetToken, hashResetToken };
