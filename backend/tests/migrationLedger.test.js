/**
 * Focused unit & schema-validation tests for backend/src/database/migrationLedger.js (T-03).
 *
 * Uses in-memory mocked MySQL sessions; never opens a network or local MySQL connection.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  LEDGER_TABLE,
  STATUSES,
  DEFAULT_MIGRATIONS_DIR,
  PARTIAL_DDL_WARNING_PREFIX,
  computeMigrationChecksum,
  discoverMigrationFiles,
  resolveMigrationTarget,
  sanitizeErrorMessage,
  ensureLedgerTable,
  markRunning,
  markApplied,
  markFailed,
  validateBaselineSchema,
  baselineMigrations,
} = require('../src/database/migrationLedger');

/**
 * Build realistic `information_schema.COLUMNS`, `information_schema.STATISTICS`,
 * and `commodity_symbols` metadata rows matching migrations 001..027 cleanly.
 */
function buildCompleteSchemaFixture({ include026 = true, include027Data = true } = {}) {
  const columns = [];
  const indexes = [];

  const addCols = (table, cols) => {
    for (const c of cols) {
      columns.push({
        TABLE_NAME: table,
        COLUMN_NAME: c.name,
        DATA_TYPE: c.dataType,
        COLUMN_TYPE: c.columnType || c.dataType,
        IS_NULLABLE: c.isNullable || 'YES',
        COLUMN_DEFAULT: Object.prototype.hasOwnProperty.call(c, 'default') ? c.default : null,
      });
    }
  };

  const addIdx = (table, indexName, unique = false) => {
    indexes.push({
      TABLE_NAME: table,
      INDEX_NAME: indexName,
      NON_UNIQUE: unique ? 0 : 1,
    });
  };

  addCols('users', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'email', dataType: 'varchar', isNullable: 'NO' },
    { name: 'password_hash', dataType: 'varchar', isNullable: 'NO' },
    { name: 'full_name', dataType: 'varchar', isNullable: 'NO' },
    { name: 'email_verified_at', dataType: 'datetime', isNullable: 'YES' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
    { name: 'updated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('users', 'uq_users_email', true);

  addCols('user_tokens', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'user_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'token_type', dataType: 'enum', columnType: "enum('PASSWORD_RESET','EMAIL_VERIFICATION')", isNullable: 'NO' },
    { name: 'token_hash', dataType: 'varchar', isNullable: 'NO' },
    { name: 'expires_at', dataType: 'datetime', isNullable: 'NO' },
    { name: 'consumed_at', dataType: 'datetime', isNullable: 'YES' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('user_tokens', 'uq_user_tokens_token_hash', true);
  addIdx('user_tokens', 'idx_user_tokens_user_type', false);
  addIdx('user_tokens', 'idx_user_tokens_expires_at', false);

  addCols('industries', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'name', dataType: 'varchar', isNullable: 'NO' },
    { name: 'slug', dataType: 'varchar', isNullable: 'NO' },
    { name: 'is_anchor', dataType: 'tinyint', isNullable: 'NO' },
    { name: 'is_lightweight_template', dataType: 'tinyint', isNullable: 'NO' },
    { name: 'description', dataType: 'varchar', isNullable: 'YES' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
    { name: 'updated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('industries', 'uq_industries_name', true);
  addIdx('industries', 'uq_industries_slug', true);

  addCols('units_of_measurement', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'name', dataType: 'varchar', isNullable: 'NO' },
    { name: 'abbreviation', dataType: 'varchar', isNullable: 'NO' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('units_of_measurement', 'uq_units_name', true);
  addIdx('units_of_measurement', 'uq_units_abbreviation', true);

  addCols('businesses', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'user_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'industry_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'name', dataType: 'varchar', isNullable: 'NO' },
    { name: 'contact_email', dataType: 'varchar', isNullable: 'YES' },
    { name: 'contact_phone', dataType: 'varchar', isNullable: 'YES' },
    { name: 'address', dataType: 'varchar', isNullable: 'YES' },
    { name: 'news_digest_enabled', dataType: 'tinyint', isNullable: 'NO' },
    { name: 'news_digest_frequency', dataType: 'enum', columnType: "enum('DAILY','WEEKLY','MONTHLY')", isNullable: 'NO' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
    { name: 'updated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('businesses', 'uq_businesses_user_id', true);

  addCols('raw_materials', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'industry_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'name', dataType: 'varchar', isNullable: 'NO' },
    { name: 'default_unit_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'default_external_symbol', dataType: 'varchar', isNullable: 'YES' },
    { name: 'description', dataType: 'varchar', isNullable: 'YES' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
    { name: 'updated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('raw_materials', 'uq_raw_materials_industry_name', true);

  addCols('cost_drivers', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'industry_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'name', dataType: 'varchar', isNullable: 'NO' },
    { name: 'description', dataType: 'varchar', isNullable: 'YES' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
    { name: 'updated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('cost_drivers', 'uq_cost_drivers_industry_name', true);

  addCols('external_factors', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'industry_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'name', dataType: 'varchar', isNullable: 'NO' },
    { name: 'description', dataType: 'varchar', isNullable: 'YES' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
    { name: 'updated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('external_factors', 'uq_external_factors_industry_name', true);

  addCols('news_keywords', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'industry_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'keyword', dataType: 'varchar', isNullable: 'NO' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('news_keywords', 'uq_news_keywords_industry_keyword', true);

  addCols('knowledge_base_dependencies', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'industry_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'source_entity_type', dataType: 'enum', columnType: "enum('RAW_MATERIAL','COST_DRIVER','EXTERNAL_FACTOR')", isNullable: 'NO' },
    { name: 'source_entity_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'target_entity_type', dataType: 'enum', columnType: "enum('RAW_MATERIAL','COST_DRIVER','EXTERNAL_FACTOR')", isNullable: 'NO' },
    { name: 'target_entity_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'dependency_type', dataType: 'enum', columnType: "enum('DRIVES_COST','INFLUENCES','CORRELATES_WITH')", isNullable: 'NO' },
    { name: 'description', dataType: 'varchar', isNullable: 'YES' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('knowledge_base_dependencies', 'uq_kb_dependencies_edge', true);
  addIdx('knowledge_base_dependencies', 'idx_kb_dependencies_source', false);
  addIdx('knowledge_base_dependencies', 'idx_kb_dependencies_target', false);
  addIdx('knowledge_base_dependencies', 'idx_kb_dependencies_industry', false);

  addCols('tracked_materials', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'business_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'raw_material_id', dataType: 'bigint', isNullable: 'YES' },
    { name: 'custom_name', dataType: 'varchar', isNullable: 'YES' },
    { name: 'external_symbol', dataType: 'varchar', isNullable: 'YES' },
    { name: 'unit_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'is_tracked', dataType: 'tinyint', isNullable: 'NO' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
    { name: 'updated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('tracked_materials', 'idx_tracked_materials_business_tracked', false);
  addIdx('tracked_materials', 'idx_tracked_materials_raw_material', false);

  addCols('price_points', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'tracked_material_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'price', dataType: 'decimal', isNullable: 'NO' },
    { name: 'currency', dataType: 'char', isNullable: 'YES' },
    { name: 'unit_label', dataType: 'varchar', isNullable: 'YES' },
    { name: 'region', dataType: 'varchar', isNullable: 'YES' },
    { name: 'grade', dataType: 'varchar', isNullable: 'YES' },
    { name: 'provider_name', dataType: 'varchar', isNullable: 'YES' },
    { name: 'source_url', dataType: 'varchar', isNullable: 'YES' },
    { name: 'data_class', dataType: 'enum', columnType: "enum('OFFICIAL_BENCHMARK','MARKET_INDICATIVE','SUPPLIER_QUOTE')", isNullable: 'YES' },
    { name: 'is_valid', dataType: 'tinyint', isNullable: 'NO' },
    { name: 'invalid_reason', dataType: 'varchar', isNullable: 'YES' },
    { name: 'recorded_at', dataType: 'datetime', isNullable: 'NO' },
    { name: 'source', dataType: 'enum', columnType: "enum('MANUAL','GOVERNMENT_DATASET','THIRD_PARTY_API','SUPPLIER_INTEGRATION','WEB_SCRAPE')", isNullable: 'NO' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('price_points', 'idx_price_points_material_recorded', false);
  addIdx('price_points', 'uq_price_points_material_date_source', true);

  addCols('news_items', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'title', dataType: 'varchar', isNullable: 'NO' },
    { name: 'url', dataType: 'varchar', isNullable: 'NO' },
    { name: 'url_hash', dataType: 'char', isNullable: 'NO' },
    { name: 'summary', dataType: 'text', isNullable: 'YES' },
    { name: 'source_name', dataType: 'varchar', isNullable: 'YES' },
    { name: 'published_at', dataType: 'datetime', isNullable: 'YES' },
    { name: 'ingested_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('news_items', 'uq_news_items_url_hash', true);
  addIdx('news_items', 'idx_news_items_published_at', false);

  addCols('news_item_tags', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'news_item_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'industry_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'matched_keyword_id', dataType: 'bigint', isNullable: 'YES' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('news_item_tags', 'uq_news_item_tags_item_industry', true);
  addIdx('news_item_tags', 'idx_news_item_tags_industry', false);
  addIdx('news_item_tags', 'idx_news_item_tags_news_item', false);

  addCols('alert_rules', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'business_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'tracked_material_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'condition_type', dataType: 'enum', columnType: "enum('PRICE_ABOVE','PRICE_BELOW')", isNullable: 'NO' },
    { name: 'threshold_price', dataType: 'decimal', isNullable: 'NO' },
    { name: 'threshold_type', dataType: 'enum', columnType: "enum('ABSOLUTE','PERCENTAGE')", isNullable: 'NO' },
    {
      name: 'cooldown_hours',
      dataType: include026 ? 'smallint' : 'tinyint',
      columnType: include026 ? 'smallint unsigned' : 'tinyint unsigned',
      isNullable: 'NO',
      default: '24',
    },
    { name: 'last_triggered_at', dataType: 'datetime', isNullable: 'YES' },
    { name: 'is_active', dataType: 'tinyint', isNullable: 'NO' },
    { name: 'deleted_at', dataType: 'datetime', isNullable: 'YES' },
    { name: 'created_at', dataType: 'timestamp', isNullable: 'NO' },
    { name: 'updated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('alert_rules', 'idx_alert_rules_material_active', false);
  addIdx('alert_rules', 'idx_alert_rules_business', false);

  addCols('alert_events', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'alert_rule_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'business_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'tracked_material_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'triggered_price', dataType: 'decimal', isNullable: 'NO' },
    { name: 'threshold_price_snapshot', dataType: 'decimal', isNullable: 'NO' },
    { name: 'condition_type_snapshot', dataType: 'enum', columnType: "enum('PRICE_ABOVE','PRICE_BELOW')", isNullable: 'NO' },
    { name: 'threshold_type_snapshot', dataType: 'enum', columnType: "enum('ABSOLUTE','PERCENTAGE')", isNullable: 'NO' },
    { name: 'triggered_change_percent', dataType: 'decimal', isNullable: 'YES' },
    { name: 'notification_channel', dataType: 'enum', columnType: "enum('EMAIL')", isNullable: 'NO' },
    { name: 'delivery_status', dataType: 'enum', columnType: "enum('PENDING','SENT','FAILED')", isNullable: 'NO' },
    { name: 'delivery_attempted_at', dataType: 'datetime', isNullable: 'YES' },
    { name: 'triggered_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('alert_events', 'idx_alert_events_business_triggered', false);
  addIdx('alert_events', 'idx_alert_events_rule', false);

  addCols('sync_statuses', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    {
      name: 'job_type',
      dataType: 'enum',
      columnType: "enum('PRICE_INGESTION','NEWS_INGESTION','AI_INSIGHTS','ALERT_EVALUATION')",
      isNullable: 'NO',
    },
    { name: 'last_run_at', dataType: 'datetime', isNullable: 'YES' },
    { name: 'last_success_at', dataType: 'datetime', isNullable: 'YES' },
    { name: 'last_status', dataType: 'enum', columnType: "enum('SUCCESS','FAILED')", isNullable: 'YES' },
    { name: 'updated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('sync_statuses', 'uq_sync_statuses_job_type', true);

  addCols('ai_insights', [
    { name: 'id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'tracked_material_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'business_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'headline', dataType: 'varchar', isNullable: 'NO' },
    { name: 'what_happened', dataType: 'text', isNullable: 'NO' },
    { name: 'why_it_happened', dataType: 'text', isNullable: 'NO' },
    { name: 'business_impact', dataType: 'text', isNullable: 'NO' },
    { name: 'outlook', dataType: 'enum', columnType: "enum('BEARISH','NEUTRAL','BULLISH','VOLATILE')", isNullable: 'NO' },
    { name: 'confidence', dataType: 'enum', columnType: "enum('LOW','MEDIUM','HIGH')", isNullable: 'NO' },
    { name: 'evidence_price_range', dataType: 'varchar', isNullable: 'YES' },
    { name: 'evidence_price_points_count', dataType: 'tinyint', isNullable: 'NO' },
    { name: 'evidence_news_count', dataType: 'tinyint', isNullable: 'NO' },
    { name: 'model_used', dataType: 'varchar', isNullable: 'NO' },
    { name: 'generated_at', dataType: 'timestamp', isNullable: 'NO' },
  ]);
  addIdx('ai_insights', 'idx_ai_insights_material_generated', false);
  addIdx('ai_insights', 'idx_ai_insights_business_generated', false);

  addCols('commodity_symbols', [
    { name: 'id', dataType: 'int', isNullable: 'NO' },
    { name: 'symbol', dataType: 'varchar', isNullable: 'NO' },
    { name: 'display_name', dataType: 'varchar', isNullable: 'NO' },
    { name: 'provider', dataType: 'enum', columnType: "enum('EIA','MANUAL','GOVT_DATA','PLACEHOLDER')", isNullable: 'NO' },
    { name: 'unit_label', dataType: 'varchar', isNullable: 'NO' },
    { name: 'currency', dataType: 'char', isNullable: 'NO' },
    { name: 'data_class', dataType: 'enum', columnType: "enum('OFFICIAL_BENCHMARK','MARKET_INDICATIVE','SUPPLIER_QUOTE')", isNullable: 'NO' },
    { name: 'is_active', dataType: 'tinyint', isNullable: 'NO' },
    { name: 'notes', dataType: 'varchar', isNullable: 'YES' },
  ]);
  addIdx('commodity_symbols', 'uq_symbol', true);

  addCols('ai_insight_evidence_news', [
    { name: 'ai_insight_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'news_item_id', dataType: 'bigint', isNullable: 'NO' },
  ]);
  addIdx('ai_insight_evidence_news', 'idx_aien_news', false);

  addCols('ai_insight_evidence_prices', [
    { name: 'ai_insight_id', dataType: 'bigint', isNullable: 'NO' },
    { name: 'price_point_id', dataType: 'bigint', isNullable: 'NO' },
  ]);
  addIdx('ai_insight_evidence_prices', 'idx_aiep_price', false);

  const commoditySymbols = include027Data
    ? [
        { symbol: 'WHEAT_GOI', display_name: 'Wheat Wholesale Mandi (India, Agmarknet)', unit_label: 'INR/quintal', data_class: 'MARKET_INDICATIVE', is_active: 1 },
        { symbol: 'SUGAR_GOI', display_name: 'Sugar Wholesale Mandi (India, Agmarknet)', unit_label: 'INR/quintal', data_class: 'MARKET_INDICATIVE', is_active: 1 },
        { symbol: 'EDIBLE_OIL_GOI', display_name: 'Mustard Oil Wholesale (India, Agmarknet)', unit_label: 'INR/quintal', data_class: 'MARKET_INDICATIVE', is_active: 1 },
        { symbol: 'NAPHTHA_EIA', display_name: 'U.S. Naphtha Spot Price (EIA proxy)', unit_label: 'USD/gal', data_class: 'MARKET_INDICATIVE', is_active: 0 },
      ]
    : [
        { symbol: 'WHEAT_GOI', display_name: 'Wheat MSP / Market Price (India, data.gov.in)', unit_label: 'INR/quintal', data_class: 'OFFICIAL_BENCHMARK', is_active: 1 },
        { symbol: 'SUGAR_GOI', display_name: 'Sugar (India, data.gov.in)', unit_label: 'INR/quintal', data_class: 'MARKET_INDICATIVE', is_active: 1 },
        { symbol: 'EDIBLE_OIL_GOI', display_name: 'Edible Oil (India, data.gov.in)', unit_label: 'INR/L', data_class: 'MARKET_INDICATIVE', is_active: 1 },
        { symbol: 'NAPHTHA_EIA', display_name: 'U.S. Naphtha Spot Price (EIA proxy)', unit_label: 'USD/gal', data_class: 'MARKET_INDICATIVE', is_active: 1 },
      ];

  return { columns, indexes, commoditySymbols };
}

function createInMemoryLedgerSession(schemaFixture = buildCompleteSchemaFixture(), initialEntries = []) {
  const entries = new Map(initialEntries.map((row) => [row.migration_name, { ...row }]));
  let txSnapshot = null;

  return {
    entries,
    beginTransaction: jest.fn(async () => {
      txSnapshot = new Map(Array.from(entries.entries()).map(([k, v]) => [k, { ...v }]));
    }),
    commit: jest.fn(async () => {
      txSnapshot = null;
    }),
    rollback: jest.fn(async () => {
      if (txSnapshot) {
        entries.clear();
        for (const [k, v] of txSnapshot.entries()) {
          entries.set(k, v);
        }
        txSnapshot = null;
      }
    }),
    query: jest.fn(async (sql, params = []) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {
        return [{}];
      }
      if (normalized.includes('FROM information_schema.COLUMNS')) {
        return [schemaFixture.columns];
      }
      if (normalized.includes('FROM information_schema.STATISTICS')) {
        return [schemaFixture.indexes];
      }
      if (normalized.includes('FROM commodity_symbols')) {
        return [schemaFixture.commoditySymbols];
      }
      if (normalized.startsWith(`SELECT id, migration_name`) && normalized.includes('ORDER BY migration_name ASC')) {
        return [Array.from(entries.values()).sort((a, b) => a.migration_name.localeCompare(b.migration_name))];
      }
      if (normalized.startsWith(`SELECT id, migration_name`) && normalized.includes('WHERE migration_name = ?')) {
        const hit = entries.get(params[0]);
        return [hit ? [{ ...hit }] : []];
      }
      if (normalized.includes(`INSERT INTO ${LEDGER_TABLE}`) && normalized.includes("'RUNNING'")) {
        const [migrationName, checksum] = params;
        entries.set(migrationName, {
          id: entries.size + 1,
          migration_name: migrationName,
          checksum,
          status: STATUSES.RUNNING,
          started_at: '2026-11-11 00:00:00',
          applied_at: null,
          execution_ms: null,
          error_message: null,
        });
        return [{}];
      }
      if (normalized.includes(`INSERT INTO ${LEDGER_TABLE}`) && normalized.includes("'APPLIED'")) {
        const [migrationName, checksum] = params;
        entries.set(migrationName, {
          id: entries.size + 1,
          migration_name: migrationName,
          checksum,
          status: STATUSES.APPLIED,
          started_at: '2026-11-11 00:00:00',
          applied_at: '2026-11-11 00:00:00',
          execution_ms: 0,
          error_message: null,
        });
        return [{}];
      }
      if (normalized.startsWith(`UPDATE ${LEDGER_TABLE}`) && normalized.includes("status = 'APPLIED'")) {
        const [checksum, executionMs, migrationName] = params;
        const prev = entries.get(migrationName) || { id: entries.size + 1, migration_name: migrationName };
        entries.set(migrationName, {
          ...prev,
          checksum,
          status: STATUSES.APPLIED,
          applied_at: '2026-11-11 00:00:01',
          execution_ms: executionMs,
          error_message: null,
        });
        return [{}];
      }
      if (normalized.includes(`INSERT INTO ${LEDGER_TABLE}`) && normalized.includes("'FAILED'")) {
        const [migrationName, checksum, executionMs, errorMessage] = params;
        entries.set(migrationName, {
          id: entries.size + 1,
          migration_name: migrationName,
          checksum,
          status: STATUSES.FAILED,
          started_at: '2026-11-11 00:00:00',
          applied_at: null,
          execution_ms: executionMs,
          error_message: errorMessage,
        });
        return [{}];
      }

      throw new Error(`Unexpected SQL in ledger test: ${normalized}`);
    }),
  };
}

describe('Migration Ledger & Baseline Schema Validation (migrationLedger.js)', () => {
  test('1. discovers existing migrations 001..027 in order and resolves exact identifiers strictly', () => {
    const files = discoverMigrationFiles();
    expect(files[0]).toBe('001_create_users_table.js');
    expect(files).toContain('026_widen_alert_rule_cooldown_hours.js');
    expect(files).toContain('027_reconcile_commodity_symbols_metadata.js');
    expect(files.length).toBeGreaterThanOrEqual(27);

    // Exact filename, basename without .js, and unambiguous 3-digit prefix all resolve canonically
    const byFilename = resolveMigrationTarget('027_reconcile_commodity_symbols_metadata.js');
    const byStem = resolveMigrationTarget('027_reconcile_commodity_symbols_metadata');
    const byPrefix = resolveMigrationTarget('027');

    expect(byFilename.filename).toBe('027_reconcile_commodity_symbols_metadata.js');
    expect(byStem.filename).toBe('027_reconcile_commodity_symbols_metadata.js');
    expect(byPrefix.filename).toBe('027_reconcile_commodity_symbols_metadata.js');
    expect(byFilename.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(computeMigrationChecksum(path.join(DEFAULT_MIGRATIONS_DIR, '026_widen_alert_rule_cooldown_hours.js'))).toMatch(/^[a-f0-9]{64}$/);

    const invalidInputs = [
      '',
      '   ',
      ' 027 ',
      '999_does_not_exist.js',
      '999',
      '02',
      '27',
      '../027_reconcile_commodity_symbols_metadata.js',
      '..\\027_reconcile_commodity_symbols_metadata.js',
      `027\0.js`,
      '__proto__',
      'constructor',
    ];
    for (const bad of invalidInputs) {
      expect(() => resolveMigrationTarget(bad)).toThrow();
    }

    // Ambiguous 3-digit prefix is rejected cleanly
    const ambiguousFs = {
      ...fs,
      readdirSync: () => ['027_first.js', '027_second.js'],
    };
    expect(() => resolveMigrationTarget('027', { fsModule: ambiguousFs })).toThrow(/Ambiguous migration identifier/);
  });

  test('2. ensures schema_migrations DDL, manages RUNNING -> APPLIED / FAILED state, and redacts secrets cleanly', async () => {
    const session = createInMemoryLedgerSession();
    await ensureLedgerTable(session);

    const createCall = session.query.mock.calls[0][0];
    expect(createCall).toContain('CREATE TABLE IF NOT EXISTS schema_migrations');
    expect(createCall).toContain("ENUM('RUNNING','APPLIED','FAILED')");
    expect(createCall).toContain('UNIQUE KEY uq_schema_migrations_name');

    await markRunning(session, { migrationName: '027_reconcile_commodity_symbols_metadata.js', checksum: 'a'.repeat(64) });
    expect(session.entries.get('027_reconcile_commodity_symbols_metadata.js').status).toBe(STATUSES.RUNNING);
    expect(session.entries.get('027_reconcile_commodity_symbols_metadata.js').applied_at).toBeNull();

    await markApplied(session, {
      migrationName: '027_reconcile_commodity_symbols_metadata.js',
      checksum: 'a'.repeat(64),
      executionMs: 42,
    });
    const appliedRow = session.entries.get('027_reconcile_commodity_symbols_metadata.js');
    expect(appliedRow.status).toBe(STATUSES.APPLIED);
    expect(appliedRow.execution_ms).toBe(42);
    expect(appliedRow.error_message).toBeNull();

    const sanitized = await markFailed(session, {
      migrationName: '027_reconcile_commodity_symbols_metadata.js',
      checksum: 'a'.repeat(64),
      executionMs: 17,
      errorMessage: new Error('mysql://avnadmin:SecretPass99@host:25000/defaultdb password=SuperSecret!\nLine2 ' + 'x'.repeat(1200)),
    });
    expect(sanitized.startsWith(PARTIAL_DDL_WARNING_PREFIX)).toBe(true);
    expect(sanitized.length).toBeLessThanOrEqual(1000);
    expect(sanitized).not.toContain('SecretPass99');
    expect(sanitized).not.toContain('SuperSecret!');
    expect(sanitized).toContain('mysql://***@host:25000');

    const failedRow = session.entries.get('027_reconcile_commodity_symbols_metadata.js');
    expect(failedRow.status).toBe(STATUSES.FAILED);
    expect(failedRow.applied_at).toBeNull();
    expect(sanitizeErrorMessage('DB_PASSWORD="TopSecretValue"').includes('TopSecretValue')).toBe(false);
  });

  test('3. baseline validates full schema (columns, types, enums, indexes, 027 data) and records APPLIED idempotently without replaying DDL', async () => {
    const fixture = buildCompleteSchemaFixture({ include026: true, include027Data: false });
    const session = createInMemoryLedgerSession(fixture);

    const summary = await baselineMigrations(session, { upTo: '026' });
    expect(summary.upTo).toBe('026_widen_alert_rule_cooldown_hours.js');
    expect(summary.checkedMigrations).toBe(26);
    expect(summary.checksPerformed).toBeGreaterThan(100);
    expect(summary.recorded).toHaveLength(26);
    expect(session.beginTransaction).toHaveBeenCalledTimes(1);
    expect(session.commit).toHaveBeenCalledTimes(1);
    expect(session.entries.has('027_reconcile_commodity_symbols_metadata.js')).toBe(false);

    // Re-running baseline skips already APPLIED entries cleanly
    const secondRun = await baselineMigrations(session, { upTo: '026' });
    expect(secondRun.recorded).toHaveLength(0);
    expect(secondRun.skippedAlreadyApplied).toHaveLength(26);
    expect(secondRun.skippedAlreadyApplied.every((item) => item.checksumChanged === false)).toBe(true);
  });

  test('4. baseline rejects subtle schema mismatches rather than relying only on table existence', async () => {
    // Case A: alert_rules.cooldown_hours is still tinyint when trying to baseline 026
    const pre026Fixture = buildCompleteSchemaFixture({ include026: false });
    const pre026Session = createInMemoryLedgerSession(pre026Fixture);
    await expect(validateBaselineSchema(pre026Session, ['026_widen_alert_rule_cooldown_hours.js'])).rejects.toThrow(
      /expected DATA_TYPE in \[smallint\], got "tinyint"/
    );
    // Yet 023 accepts tinyint cleanly on pre-026 database
    await expect(validateBaselineSchema(pre026Session, ['023_add_alert_rule_enhancements.js'])).resolves.toMatchObject({
      valid: true,
    });

    // Case B: missing ALERT_EVALUATION enum option in sync_statuses.job_type
    const missingEnumFixture = buildCompleteSchemaFixture();
    const jobTypeCol = missingEnumFixture.columns.find(
      (c) => c.TABLE_NAME === 'sync_statuses' && c.COLUMN_NAME === 'job_type'
    );
    jobTypeCol.COLUMN_TYPE = "enum('PRICE_INGESTION','NEWS_INGESTION','AI_INSIGHTS')";
    await expect(
      validateBaselineSchema(createInMemoryLedgerSession(missingEnumFixture), ['023_add_alert_rule_enhancements.js'])
    ).rejects.toThrow(/missing "ALERT_EVALUATION"/);

    // Case C: missing unique constraint from migration 019
    const missingIndexFixture = buildCompleteSchemaFixture();
    missingIndexFixture.indexes = missingIndexFixture.indexes.filter(
      (idx) => idx.INDEX_NAME !== 'uq_price_points_material_date_source'
    );
    await expect(
      validateBaselineSchema(createInMemoryLedgerSession(missingIndexFixture), ['019_add_price_points_unique_constraint.js'])
    ).rejects.toThrow(/Missing required index "price_points.uq_price_points_material_date_source"/);

    // Case D: stale 022 metadata when trying to baseline 027
    const stale027Fixture = buildCompleteSchemaFixture({ include026: true, include027Data: false });
    await expect(
      validateBaselineSchema(createInMemoryLedgerSession(stale027Fixture), ['027_reconcile_commodity_symbols_metadata.js'])
    ).rejects.toThrow(/WHEAT_GOI.*MARKET_INDICATIVE/);

    // Case E: refuses to overwrite FAILED or RUNNING ledger rows during baseline
    const failedSession = createInMemoryLedgerSession(buildCompleteSchemaFixture(), [
      {
        id: 1,
        migration_name: '023_add_alert_rule_enhancements.js',
        checksum: 'b'.repeat(64),
        status: STATUSES.FAILED,
      },
    ]);
    await expect(baselineMigrations(failedSession, { upTo: '026' })).rejects.toThrow(/non-APPLIED ledger entry/);
  });
});
