/**
 * news_keywords table (Document 4 §5.3) — configurable keyword sets per industry.
 */
const up = `
CREATE TABLE IF NOT EXISTS news_keywords (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  industry_id BIGINT UNSIGNED NOT NULL,
  keyword VARCHAR(150) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_news_keywords_industry_keyword (industry_id, keyword),
  CONSTRAINT fk_news_keywords_industry FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS news_keywords;`;
module.exports = { up, down };
