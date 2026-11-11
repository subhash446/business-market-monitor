/**
 * Migration 024 - Phase 3: AI Insight Evidence Traceability.
 *
 * Creates junction tables linking AI market intelligence insights to the
 * exact evidence sources that informed them:
 *
 * 1. ai_insight_evidence_news:
 *    Links an ai_insight to the news_items articles provided in the prompt.
 *    Composite primary key (ai_insight_id, news_item_id) prevents duplicates.
 *    ON DELETE CASCADE cleans up evidence associations if an insight or news
 *    item is deleted.
 *
 * 2. ai_insight_evidence_prices:
 *    Links an ai_insight to the price_points records used in the evidence window.
 *    Composite primary key (ai_insight_id, price_point_id) prevents duplicates.
 *    ON DELETE CASCADE cleans up associations if an insight or price point
 *    is deleted.
 */

'use strict';

async function up(pool) {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ai_insight_evidence_news (
      ai_insight_id BIGINT UNSIGNED NOT NULL,
      news_item_id  BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (ai_insight_id, news_item_id),
      KEY idx_aien_news (news_item_id),
      CONSTRAINT fk_aien_insight
        FOREIGN KEY (ai_insight_id) REFERENCES ai_insights(id) ON DELETE CASCADE,
      CONSTRAINT fk_aien_news
        FOREIGN KEY (news_item_id) REFERENCES news_items(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ai_insight_evidence_prices (
      ai_insight_id  BIGINT UNSIGNED NOT NULL,
      price_point_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (ai_insight_id, price_point_id),
      KEY idx_aiep_price (price_point_id),
      CONSTRAINT fk_aiep_insight
        FOREIGN KEY (ai_insight_id) REFERENCES ai_insights(id) ON DELETE CASCADE,
      CONSTRAINT fk_aiep_price
        FOREIGN KEY (price_point_id) REFERENCES price_points(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function down(pool) {
  await pool.execute('DROP TABLE IF EXISTS ai_insight_evidence_prices');
  await pool.execute('DROP TABLE IF EXISTS ai_insight_evidence_news');
}

module.exports = { up, down };
