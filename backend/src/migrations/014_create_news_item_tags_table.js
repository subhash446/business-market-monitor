/**
 * news_item_tags table (Document 4 §5.5) — many-to-many bridge: News Item
 * ↔ Industry (FR-NEWS-02, 03), with optional traceability to the keyword
 * that matched. A news item is tagged to a given industry at most once,
 * even if multiple keywords matched (uq_news_item_tags_item_industry).
 */
const up = `
CREATE TABLE IF NOT EXISTS news_item_tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  news_item_id BIGINT UNSIGNED NOT NULL,
  industry_id BIGINT UNSIGNED NOT NULL,
  matched_keyword_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_news_item_tags_item_industry (news_item_id, industry_id),
  KEY idx_news_item_tags_industry (industry_id),
  KEY idx_news_item_tags_news_item (news_item_id),
  CONSTRAINT fk_news_item_tags_news_item FOREIGN KEY (news_item_id) REFERENCES news_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_news_item_tags_industry FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE CASCADE,
  CONSTRAINT fk_news_item_tags_keyword FOREIGN KEY (matched_keyword_id) REFERENCES news_keywords(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
const down = `DROP TABLE IF EXISTS news_item_tags;`;
module.exports = { up, down };
