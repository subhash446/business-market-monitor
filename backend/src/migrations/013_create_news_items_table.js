/**
 * news_items table (Document 4 §5.5) — ingested news articles (FR-NEWS-01, 04).
 * url_hash (SHA-256 of url) is the actual de-dup mechanism, not a unique
 * index on the raw url column — VARCHAR(1000) under utf8mb4 can exceed
 * MySQL's indexable key-length limits (Document 4 §5.5 note).
 */
const up = `
CREATE TABLE IF NOT EXISTS news_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(500) NOT NULL,
  url VARCHAR(1000) NOT NULL,
  url_hash CHAR(64) NOT NULL,
  summary TEXT NULL,
  source_name VARCHAR(150) NULL,
  published_at DATETIME NULL,
  ingested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_news_items_url_hash (url_hash),
  KEY idx_news_items_published_at (published_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS news_items;`;
module.exports = { up, down };
