/**
 * users table (Document 4 §5.1) — the authentication root entity.
 * Implemented now (Phase 2) because the Authentication module cannot be
 * verified end-to-end without it. A generic migration-runner is still a
 * deferred decision (Document 4 §2.1) — this file exports raw DDL only.
 */
const up = `
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email_verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const down = `DROP TABLE IF EXISTS users;`;

module.exports = { up, down };
