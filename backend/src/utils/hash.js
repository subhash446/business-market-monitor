/**
 * bcrypt wrappers (Document 3 §13, NFR-SEC-01). Passwords are never stored
 * or logged in plaintext anywhere in the codebase — this is the only module
 * allowed to touch bcrypt directly.
 */
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function comparePassword(plainPassword, hash) {
  return bcrypt.compare(plainPassword, hash);
}

module.exports = { hashPassword, comparePassword };
