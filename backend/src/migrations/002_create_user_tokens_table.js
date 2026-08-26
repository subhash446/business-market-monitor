/**
 * user_tokens table (Document 4 §5.1) — password reset / email verification
 * tokens. Implemented for Password Reset (FR-AUTH-07); email verification
 * (FR-AUTH-08, optional/non-blocking per Document 2 §5.1) still does not
 * write rows here — only PASSWORD_RESET is used by the current codebase.
 *
 * token_hash stores only a SHA-256 hash of the raw token (utils/resetToken.js)
 * — the raw token itself is never persisted, matching "store only the
 * hashed token in the database."
 */
const up = `
CREATE TABLE IF NOT EXISTS user_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_type ENUM('PASSWORD_RESET','EMAIL_VERIFICATION') NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_tokens_token_hash (token_hash),
  KEY idx_user_tokens_user_type (user_id, token_type),
  KEY idx_user_tokens_expires_at (expires_at),
  CONSTRAINT fk_user_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS user_tokens;`;
module.exports = { up, down };
