/**
 * businesses table (Document 4 §5.2) — Phase 3 (Business Profile) scope.
 */
const up = `
CREATE TABLE IF NOT EXISTS businesses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  industry_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(200) NOT NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(30) NULL,
  address VARCHAR(500) NULL,
  news_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  news_digest_frequency ENUM('DAILY','WEEKLY','MONTHLY') NOT NULL DEFAULT 'WEEKLY',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_businesses_user_id (user_id),
  CONSTRAINT fk_businesses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_businesses_industry FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const down = `DROP TABLE IF EXISTS businesses;`;

module.exports = { up, down };
