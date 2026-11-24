/**
 * Migration Ledger & Safe Baseline Validator (T-03).
 *
 * Tracks applied and failed migrations in `schema_migrations` (InnoDB, utf8mb4)
 * compatible with MySQL 8.0.16+ and the frozen architecture (`docs/Document-4`).
 *
 * Design notes:
 * - Lives in `src/database/` (NOT `src/migrations/`) so `scripts/migrate.js`
 *   never treats this module as a numbered migration file.
 * - Because MySQL DDL (`CREATE TABLE`, `ALTER TABLE`) causes an implicit commit,
 *   partial schema changes can remain when a multi-step migration fails mid-run.
 *   Failed runs are recorded cleanly as `FAILED` with a partial-DDL warning and
 *   are never retried automatically without explicit operator investigation.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LEDGER_TABLE = 'schema_migrations';
const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');
const MIGRATION_FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.js$/i;
const DEFAULT_LOCK_WAIT_TIMEOUT_SECONDS = 30;
const MAX_ERROR_MESSAGE_LENGTH = 1000;
const PARTIAL_DDL_WARNING_PREFIX = '[WARN: Partial DDL changes may exist] ';

const STATUSES = Object.freeze({
  RUNNING: 'RUNNING',
  APPLIED: 'APPLIED',
  FAILED: 'FAILED',
});

const CREATE_LEDGER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  migration_name VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  status ENUM('RUNNING','APPLIED','FAILED') NOT NULL,
  started_at DATETIME NULL,
  applied_at DATETIME NULL,
  execution_ms INT UNSIGNED NULL,
  error_message VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schema_migrations_name (migration_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`.trim();

/**
 * Comprehensive schema expectations for baselining pre-existing databases (`001`–`027`)
 * without replaying historical migration scripts. Every rule verifies columns, types/ENUM
 * members, nullability/defaults where relevant, and indexes/unique constraints.
 */
const BASELINE_SCHEMA_SPECS = Object.freeze({
  '001_create_users_table.js': {
    tables: {
      users: {
        columns: {
          id: { dataType: 'bigint' },
          email: { dataType: 'varchar', isNullable: 'NO' },
          password_hash: { dataType: 'varchar', isNullable: 'NO' },
          full_name: { dataType: 'varchar', isNullable: 'NO' },
          email_verified_at: { dataType: 'datetime' },
          created_at: { dataType: 'timestamp' },
          updated_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_users_email: { unique: true },
        },
      },
    },
  },
  '002_create_user_tokens_table.js': {
    tables: {
      user_tokens: {
        columns: {
          id: { dataType: 'bigint' },
          user_id: { dataType: 'bigint', isNullable: 'NO' },
          token_type: { dataType: 'enum', columnTypeIncludes: ['PASSWORD_RESET', 'EMAIL_VERIFICATION'] },
          token_hash: { dataType: 'varchar', isNullable: 'NO' },
          expires_at: { dataType: 'datetime', isNullable: 'NO' },
          consumed_at: { dataType: 'datetime' },
          created_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_user_tokens_token_hash: { unique: true },
          idx_user_tokens_user_type: {},
          idx_user_tokens_expires_at: {},
        },
      },
    },
  },
  '003_create_industries_table.js': {
    tables: {
      industries: {
        columns: {
          id: { dataType: 'bigint' },
          name: { dataType: 'varchar', isNullable: 'NO' },
          slug: { dataType: 'varchar', isNullable: 'NO' },
          is_anchor: { dataType: 'tinyint' },
          is_lightweight_template: { dataType: 'tinyint' },
          description: { dataType: 'varchar' },
          created_at: { dataType: 'timestamp' },
          updated_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_industries_name: { unique: true },
          uq_industries_slug: { unique: true },
        },
      },
    },
  },
  '004_create_units_of_measurement_table.js': {
    tables: {
      units_of_measurement: {
        columns: {
          id: { dataType: 'bigint' },
          name: { dataType: 'varchar', isNullable: 'NO' },
          abbreviation: { dataType: 'varchar', isNullable: 'NO' },
          created_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_units_name: { unique: true },
          uq_units_abbreviation: { unique: true },
        },
      },
    },
  },
  '005_create_businesses_table.js': {
    tables: {
      businesses: {
        columns: {
          id: { dataType: 'bigint' },
          user_id: { dataType: 'bigint', isNullable: 'NO' },
          industry_id: { dataType: 'bigint', isNullable: 'NO' },
          name: { dataType: 'varchar', isNullable: 'NO' },
          contact_email: { dataType: 'varchar' },
          contact_phone: { dataType: 'varchar' },
          address: { dataType: 'varchar' },
          news_digest_enabled: { dataType: 'tinyint' },
          news_digest_frequency: { dataType: 'enum', columnTypeIncludes: ['DAILY', 'WEEKLY', 'MONTHLY'] },
          created_at: { dataType: 'timestamp' },
          updated_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_businesses_user_id: { unique: true },
        },
      },
    },
  },
  '006_create_raw_materials_table.js': {
    tables: {
      raw_materials: {
        columns: {
          id: { dataType: 'bigint' },
          industry_id: { dataType: 'bigint', isNullable: 'NO' },
          name: { dataType: 'varchar', isNullable: 'NO' },
          default_unit_id: { dataType: 'bigint', isNullable: 'NO' },
          description: { dataType: 'varchar' },
          created_at: { dataType: 'timestamp' },
          updated_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_raw_materials_industry_name: { unique: true },
        },
      },
    },
  },
  '007_create_cost_drivers_table.js': {
    tables: {
      cost_drivers: {
        columns: {
          id: { dataType: 'bigint' },
          industry_id: { dataType: 'bigint', isNullable: 'NO' },
          name: { dataType: 'varchar', isNullable: 'NO' },
          description: { dataType: 'varchar' },
          created_at: { dataType: 'timestamp' },
          updated_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_cost_drivers_industry_name: { unique: true },
        },
      },
    },
  },
  '008_create_external_factors_table.js': {
    tables: {
      external_factors: {
        columns: {
          id: { dataType: 'bigint' },
          industry_id: { dataType: 'bigint', isNullable: 'NO' },
          name: { dataType: 'varchar', isNullable: 'NO' },
          description: { dataType: 'varchar' },
          created_at: { dataType: 'timestamp' },
          updated_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_external_factors_industry_name: { unique: true },
        },
      },
    },
  },
  '009_create_news_keywords_table.js': {
    tables: {
      news_keywords: {
        columns: {
          id: { dataType: 'bigint' },
          industry_id: { dataType: 'bigint', isNullable: 'NO' },
          keyword: { dataType: 'varchar', isNullable: 'NO' },
          created_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_news_keywords_industry_keyword: { unique: true },
        },
      },
    },
  },
  '010_create_knowledge_base_dependencies_table.js': {
    tables: {
      knowledge_base_dependencies: {
        columns: {
          id: { dataType: 'bigint' },
          industry_id: { dataType: 'bigint', isNullable: 'NO' },
          source_entity_type: { dataType: 'enum', columnTypeIncludes: ['RAW_MATERIAL', 'COST_DRIVER', 'EXTERNAL_FACTOR'] },
          source_entity_id: { dataType: 'bigint', isNullable: 'NO' },
          target_entity_type: { dataType: 'enum', columnTypeIncludes: ['RAW_MATERIAL', 'COST_DRIVER', 'EXTERNAL_FACTOR'] },
          target_entity_id: { dataType: 'bigint', isNullable: 'NO' },
          dependency_type: { dataType: 'enum', columnTypeIncludes: ['DRIVES_COST', 'INFLUENCES', 'CORRELATES_WITH'] },
          description: { dataType: 'varchar' },
          created_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_kb_dependencies_edge: { unique: true },
          idx_kb_dependencies_source: {},
          idx_kb_dependencies_target: {},
          idx_kb_dependencies_industry: {},
        },
      },
    },
  },
  '011_create_tracked_materials_table.js': {
    tables: {
      tracked_materials: {
        columns: {
          id: { dataType: 'bigint' },
          business_id: { dataType: 'bigint', isNullable: 'NO' },
          raw_material_id: { dataType: 'bigint' },
          custom_name: { dataType: 'varchar' },
          unit_id: { dataType: 'bigint', isNullable: 'NO' },
          is_tracked: { dataType: 'tinyint' },
          created_at: { dataType: 'timestamp' },
          updated_at: { dataType: 'timestamp' },
        },
        indexes: {
          idx_tracked_materials_business_tracked: {},
          idx_tracked_materials_raw_material: {},
        },
      },
    },
  },
  '012_create_price_points_table.js': {
    tables: {
      price_points: {
        columns: {
          id: { dataType: 'bigint' },
          tracked_material_id: { dataType: 'bigint', isNullable: 'NO' },
          price: { dataType: 'decimal', isNullable: 'NO' },
          recorded_at: { dataType: 'datetime', isNullable: 'NO' },
          source: {
            dataType: 'enum',
            columnTypeIncludes: ['MANUAL', 'GOVERNMENT_DATASET', 'THIRD_PARTY_API'],
          },
          created_at: { dataType: 'timestamp' },
        },
        indexes: {
          idx_price_points_material_recorded: {},
        },
      },
    },
  },
  '013_create_news_items_table.js': {
    tables: {
      news_items: {
        columns: {
          id: { dataType: 'bigint' },
          title: { dataType: 'varchar', isNullable: 'NO' },
          url: { dataType: 'varchar', isNullable: 'NO' },
          url_hash: { dataType: 'char', isNullable: 'NO' },
          summary: { dataType: 'text' },
          source_name: { dataType: 'varchar' },
          published_at: { dataType: 'datetime' },
          ingested_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_news_items_url_hash: { unique: true },
          idx_news_items_published_at: {},
        },
      },
    },
  },
  '014_create_news_item_tags_table.js': {
    tables: {
      news_item_tags: {
        columns: {
          id: { dataType: 'bigint' },
          news_item_id: { dataType: 'bigint', isNullable: 'NO' },
          industry_id: { dataType: 'bigint', isNullable: 'NO' },
          matched_keyword_id: { dataType: 'bigint' },
          created_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_news_item_tags_item_industry: { unique: true },
          idx_news_item_tags_industry: {},
          idx_news_item_tags_news_item: {},
        },
      },
    },
  },
  '015_create_alert_rules_table.js': {
    tables: {
      alert_rules: {
        columns: {
          id: { dataType: 'bigint' },
          business_id: { dataType: 'bigint', isNullable: 'NO' },
          tracked_material_id: { dataType: 'bigint', isNullable: 'NO' },
          condition_type: { dataType: 'enum', columnTypeIncludes: ['PRICE_ABOVE', 'PRICE_BELOW'] },
          threshold_price: { dataType: 'decimal', isNullable: 'NO' },
          is_active: { dataType: 'tinyint' },
          deleted_at: { dataType: 'datetime' },
          created_at: { dataType: 'timestamp' },
          updated_at: { dataType: 'timestamp' },
        },
        indexes: {
          idx_alert_rules_material_active: {},
          idx_alert_rules_business: {},
        },
      },
    },
  },
  '016_create_alert_events_table.js': {
    tables: {
      alert_events: {
        columns: {
          id: { dataType: 'bigint' },
          alert_rule_id: { dataType: 'bigint', isNullable: 'NO' },
          business_id: { dataType: 'bigint', isNullable: 'NO' },
          tracked_material_id: { dataType: 'bigint', isNullable: 'NO' },
          triggered_price: { dataType: 'decimal', isNullable: 'NO' },
          threshold_price_snapshot: { dataType: 'decimal', isNullable: 'NO' },
          condition_type_snapshot: { dataType: 'enum', columnTypeIncludes: ['PRICE_ABOVE', 'PRICE_BELOW'] },
          notification_channel: { dataType: 'enum', columnTypeIncludes: ['EMAIL'] },
          delivery_status: { dataType: 'enum', columnTypeIncludes: ['PENDING', 'SENT', 'FAILED'] },
          delivery_attempted_at: { dataType: 'datetime' },
          triggered_at: { dataType: 'timestamp' },
        },
        indexes: {
          idx_alert_events_business_triggered: {},
          idx_alert_events_rule: {},
        },
      },
    },
  },
  '017_create_sync_statuses_table.js': {
    tables: {
      sync_statuses: {
        columns: {
          id: { dataType: 'bigint' },
          job_type: { dataType: 'enum', columnTypeIncludes: ['PRICE_INGESTION', 'NEWS_INGESTION'] },
          last_run_at: { dataType: 'datetime' },
          last_success_at: { dataType: 'datetime' },
          last_status: { dataType: 'enum', columnTypeIncludes: ['SUCCESS', 'FAILED'] },
          updated_at: { dataType: 'timestamp' },
        },
        indexes: {
          uq_sync_statuses_job_type: { unique: true },
        },
      },
    },
  },
  '018_add_external_symbol_to_tracked_materials.js': {
    tables: {
      tracked_materials: {
        columns: {
          external_symbol: { dataType: 'varchar', isNullable: 'YES' },
        },
      },
    },
  },
  '019_add_price_points_unique_constraint.js': {
    tables: {
      price_points: {
        indexes: {
          uq_price_points_material_date_source: { unique: true },
        },
      },
    },
  },
  '020_create_ai_insights_table.js': {
    tables: {
      ai_insights: {
        columns: {
          id: { dataType: 'bigint' },
          tracked_material_id: { dataType: 'bigint', isNullable: 'NO' },
          business_id: { dataType: 'bigint', isNullable: 'NO' },
          headline: { dataType: 'varchar', isNullable: 'NO' },
          what_happened: { dataType: 'text', isNullable: 'NO' },
          why_it_happened: { dataType: 'text', isNullable: 'NO' },
          business_impact: { dataType: 'text', isNullable: 'NO' },
          outlook: { dataType: 'enum', columnTypeIncludes: ['BEARISH', 'NEUTRAL', 'BULLISH', 'VOLATILE'] },
          confidence: { dataType: 'enum', columnTypeIncludes: ['LOW', 'MEDIUM', 'HIGH'] },
          evidence_price_range: { dataType: 'varchar' },
          evidence_price_points_count: { dataType: 'tinyint' },
          evidence_news_count: { dataType: 'tinyint' },
          model_used: { dataType: 'varchar', isNullable: 'NO' },
          generated_at: { dataType: 'timestamp' },
        },
        indexes: {
          idx_ai_insights_material_generated: {},
          idx_ai_insights_business_generated: {},
        },
      },
      sync_statuses: {
        columns: {
          job_type: { dataType: 'enum', columnTypeIncludes: ['PRICE_INGESTION', 'NEWS_INGESTION', 'AI_INSIGHTS'] },
        },
      },
    },
  },
  '021_add_metadata_to_price_points.js': {
    tables: {
      price_points: {
        columns: {
          currency: { dataType: 'char' },
          unit_label: { dataType: 'varchar' },
          region: { dataType: 'varchar' },
          grade: { dataType: 'varchar' },
          provider_name: { dataType: 'varchar' },
          source_url: { dataType: 'varchar' },
          data_class: {
            dataType: 'enum',
            columnTypeIncludes: ['OFFICIAL_BENCHMARK', 'MARKET_INDICATIVE', 'SUPPLIER_QUOTE'],
          },
          is_valid: { dataType: 'tinyint', isNullable: 'NO' },
          invalid_reason: { dataType: 'varchar' },
        },
      },
    },
  },
  '022_create_commodity_symbols_table.js': {
    tables: {
      commodity_symbols: {
        columns: {
          id: { dataType: 'int' },
          symbol: { dataType: 'varchar', isNullable: 'NO' },
          display_name: { dataType: 'varchar', isNullable: 'NO' },
          provider: { dataType: 'enum', columnTypeIncludes: ['EIA', 'MANUAL', 'GOVT_DATA', 'PLACEHOLDER'] },
          unit_label: { dataType: 'varchar', isNullable: 'NO' },
          currency: { dataType: 'char', isNullable: 'NO' },
          data_class: {
            dataType: 'enum',
            columnTypeIncludes: ['OFFICIAL_BENCHMARK', 'MARKET_INDICATIVE', 'SUPPLIER_QUOTE'],
          },
          is_active: { dataType: 'tinyint', isNullable: 'NO' },
          notes: { dataType: 'varchar' },
        },
        indexes: {
          uq_symbol: { unique: true },
        },
      },
    },
  },
  '023_add_alert_rule_enhancements.js': {
    tables: {
      alert_rules: {
        columns: {
          threshold_type: { dataType: 'enum', columnTypeIncludes: ['ABSOLUTE', 'PERCENTAGE'], isNullable: 'NO' },
          cooldown_hours: {
            dataType: ['tinyint', 'smallint'],
            columnTypeIncludes: ['unsigned'],
            isNullable: 'NO',
            columnDefault: '24',
          },
          last_triggered_at: { dataType: 'datetime' },
        },
      },
      alert_events: {
        columns: {
          threshold_type_snapshot: { dataType: 'enum', columnTypeIncludes: ['ABSOLUTE', 'PERCENTAGE'] },
          triggered_change_percent: { dataType: 'decimal' },
        },
      },
      sync_statuses: {
        columns: {
          job_type: {
            dataType: 'enum',
            columnTypeIncludes: ['PRICE_INGESTION', 'NEWS_INGESTION', 'AI_INSIGHTS', 'ALERT_EVALUATION'],
          },
        },
      },
    },
  },
  '024_create_ai_insight_evidence_tables.js': {
    tables: {
      ai_insight_evidence_news: {
        columns: {
          ai_insight_id: { dataType: 'bigint', isNullable: 'NO' },
          news_item_id: { dataType: 'bigint', isNullable: 'NO' },
        },
        indexes: {
          idx_aien_news: {},
        },
      },
      ai_insight_evidence_prices: {
        columns: {
          ai_insight_id: { dataType: 'bigint', isNullable: 'NO' },
          price_point_id: { dataType: 'bigint', isNullable: 'NO' },
        },
        indexes: {
          idx_aiep_price: {},
        },
      },
    },
  },
  '025_add_default_external_symbol_to_raw_materials.js': {
    tables: {
      raw_materials: {
        columns: {
          default_external_symbol: { dataType: 'varchar', isNullable: 'YES' },
        },
      },
    },
  },
  '026_widen_alert_rule_cooldown_hours.js': {
    tables: {
      alert_rules: {
        columns: {
          cooldown_hours: {
            dataType: 'smallint',
            columnTypeIncludes: ['unsigned'],
            isNullable: 'NO',
            columnDefault: '24',
          },
        },
      },
    },
  },
  '027_reconcile_commodity_symbols_metadata.js': {
    tables: {
      commodity_symbols: {
        columns: {
          symbol: { dataType: 'varchar', isNullable: 'NO' },
          display_name: { dataType: 'varchar', isNullable: 'NO' },
          unit_label: { dataType: 'varchar', isNullable: 'NO' },
          data_class: { dataType: 'enum', columnTypeIncludes: ['MARKET_INDICATIVE'] },
          is_active: { dataType: 'tinyint', isNullable: 'NO' },
        },
      },
    },
    verifyCustom: verifyMigration027BaselineData,
  },
  '028_add_procurement_recommendations_to_ai_insights.js': {
    tables: {
      ai_insights: {
        columns: {
          action_recommendation: { dataType: 'enum', columnTypeIncludes: ['ACCELERATE_PURCHASE', 'DELAY_PURCHASE', 'MAINTAIN_BUFFER', 'MONITOR_ONLY'], isNullable: 'YES' },
          recommendation_rationale: { dataType: 'text', isNullable: 'YES' },
          recommendation_horizon: { dataType: 'enum', columnTypeIncludes: ['IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM'], isNullable: 'YES' },
          is_downgraded: { dataType: 'tinyint', isNullable: 'NO' },
          downgrade_reason: { dataType: 'varchar', isNullable: 'YES' },
        },
      },
    },
  },
  '029_add_whatsapp_alert_channel.js': {
    tables: {
      alert_rules: {
        columns: {
          notification_channel: { dataType: 'enum', columnTypeIncludes: ['EMAIL', 'WHATSAPP', 'BOTH'], isNullable: 'NO' },
          destination_phone: { dataType: 'varchar', isNullable: 'YES' },
        },
      },
      alert_events: {
        columns: {
          notification_channel: { dataType: 'enum', columnTypeIncludes: ['EMAIL', 'WHATSAPP'], isNullable: 'NO' },
          recipient_phone_snapshot: { dataType: 'varchar', isNullable: 'YES' },
        },
      },
    },
  },
  '030_add_news_digest_enhancements.js': {
    tables: {
      businesses: {
        columns: {
          news_digest_channel: { dataType: 'enum', columnTypeIncludes: ['EMAIL', 'WHATSAPP', 'BOTH'], isNullable: 'NO' },
          last_digest_sent_at: { dataType: ['datetime', 'timestamp'], isNullable: 'YES' },
        },
      },
      sync_statuses: {
        columns: {
          job_type: { dataType: 'enum', columnTypeIncludes: ['NEWS_DIGEST'], isNullable: 'NO' },
        },
      },
    },
  },
  '031_add_inventory_profile_to_tracked_materials.js': {
    tables: {
      tracked_materials: {
        columns: {
          current_stock_qty: { dataType: 'decimal', isNullable: 'YES' },
          daily_consumption_rate: { dataType: 'decimal', isNullable: 'YES' },
          supplier_lead_time_days: { dataType: ['int', 'smallint', 'tinyint', 'mediumint'], isNullable: 'YES' },
          max_storage_days: { dataType: ['int', 'smallint', 'tinyint', 'mediumint'], isNullable: 'YES' },
          inventory_updated_at: { dataType: ['datetime', 'timestamp'], isNullable: 'YES' },
        },
      },
    },
  },
  '032_add_news_impact_scoring_to_news_items.js': {
    tables: {
      news_items: {
        columns: {
          impact_direction: { dataType: 'enum', columnTypeIncludes: ['COST_UP', 'COST_DOWN', 'NEUTRAL'], isNullable: 'YES' },
          severity_score: { dataType: ['tinyint', 'int'], isNullable: 'YES' },
          expected_lag_days: { dataType: ['smallint', 'int'], isNullable: 'YES' },
          impact_rationale: { dataType: 'varchar', isNullable: 'YES' },
          scoring_method: { dataType: 'enum', columnTypeIncludes: ['DETERMINISTIC_HEURISTIC', 'AI_ASSISTED'], isNullable: 'YES' },
          impact_scored_at: { dataType: ['datetime', 'timestamp'], isNullable: 'YES' },
        },
        indexes: {
          idx_news_items_impact: {},
        },
      },
    },
  },
  '033_add_fx_rates_and_landed_cost_config.js': {
    tables: {
      fx_rates: {
        columns: {
          id: { dataType: 'bigint' },
          base_currency: { dataType: 'varchar', isNullable: 'NO' },
          quote_currency: { dataType: 'varchar', isNullable: 'NO' },
          rate: { dataType: 'decimal', isNullable: 'NO' },
          rate_date: { dataType: 'date', isNullable: 'NO' },
          source: { dataType: 'varchar', isNullable: 'NO' },
          fetched_at: { dataType: ['datetime', 'timestamp'], isNullable: 'NO' },
        },
        indexes: {
          uq_fx_rates_pair_date: { unique: true },
        },
      },
      tracked_materials: {
        columns: {
          landed_unit_factor: { dataType: 'decimal', isNullable: 'YES' },
          landed_duty_freight_pct: { dataType: 'decimal', isNullable: 'YES' },
          landed_fixed_spread_inr: { dataType: 'decimal', isNullable: 'YES' },
          landed_config_updated_at: { dataType: ['datetime', 'timestamp'], isNullable: 'YES' },
        },
      },
      sync_statuses: {
        columns: {
          job_type: { dataType: 'enum', columnTypeIncludes: ['FX_INGESTION'], isNullable: 'NO' },
        },
      },
    },
  },
  '034_create_whatsapp_inbound_messages_table.js': {
    tables: {
      whatsapp_inbound_messages: {
        columns: {
          id: { dataType: 'bigint' },
          business_id: { dataType: 'bigint', isNullable: 'NO' },
          external_message_id: { dataType: 'varchar', isNullable: 'NO' },
          sender_phone_masked: { dataType: 'varchar', isNullable: 'NO' },
          sender_phone_hash: { dataType: 'varchar', isNullable: 'NO' },
          raw_text: { dataType: ['text', 'varchar'], isNullable: 'NO' },
          parsed_material_id: { dataType: 'bigint', isNullable: 'YES' },
          parsed_price: { dataType: 'decimal', isNullable: 'YES' },
          parsed_currency: { dataType: 'varchar', isNullable: 'YES' },
          parsed_unit: { dataType: 'varchar', isNullable: 'YES' },
          parsed_supplier_name: { dataType: 'varchar', isNullable: 'YES' },
          logged_price_point_id: { dataType: 'bigint', isNullable: 'YES' },
          suggested_counter_low: { dataType: 'decimal', isNullable: 'YES' },
          suggested_counter_high: { dataType: 'decimal', isNullable: 'YES' },
          processing_status: { dataType: 'enum', columnTypeIncludes: ['PARSED', 'UNRECOGNIZED', 'FAILED'], isNullable: 'NO' },
          reply_status: { dataType: 'enum', columnTypeIncludes: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'], isNullable: 'NO' },
          created_at: { dataType: ['datetime', 'timestamp'], isNullable: 'NO' },
        },
        indexes: {
          uq_whatsapp_inbound_external_id: { unique: true },
          idx_whatsapp_inbound_biz_created: {},
          idx_whatsapp_inbound_sender_hash: {},
        },
      },
    },
  },
  '035_create_business_members_table.js': {
    tables: {
      business_members: {
        columns: {
          id: { dataType: 'bigint' },
          business_id: { dataType: 'bigint', isNullable: 'NO' },
          user_id: { dataType: 'bigint', isNullable: 'YES' },
          invited_email: { dataType: 'varchar', isNullable: 'NO' },
          role: { dataType: 'enum', columnTypeIncludes: ['OWNER', 'PURCHASE_MANAGER', 'VIEWER'], isNullable: 'NO' },
          status: { dataType: 'enum', columnTypeIncludes: ['ACTIVE', 'INVITED', 'REVOKED'], isNullable: 'NO' },
          invite_token_hash: { dataType: 'varchar', isNullable: 'YES' },
          invite_expires_at: { dataType: ['datetime', 'timestamp'], isNullable: 'YES' },
          invited_by: { dataType: 'bigint', isNullable: 'YES' },
          accepted_at: { dataType: ['datetime', 'timestamp'], isNullable: 'YES' },
          created_at: { dataType: ['datetime', 'timestamp'], isNullable: 'NO' },
          updated_at: { dataType: ['datetime', 'timestamp'], isNullable: 'NO' },
        },
        indexes: {
          uq_biz_member_active_user: { unique: true },
          idx_biz_member_token_hash: {},
          idx_biz_member_user_status: {},
          idx_biz_member_email_status: {},
          idx_biz_member_biz_role: {},
        },
      },
    },
  },
  '036_add_google_oauth_and_email_otp.js': {
    tables: {
      users: {
        columns: {
          password_hash: { dataType: 'varchar', isNullable: 'YES' },
          auth_provider: { dataType: 'enum', columnTypeIncludes: ['LOCAL', 'GOOGLE', 'EMAIL_OTP'], isNullable: 'NO' },
          google_sub: { dataType: 'varchar', isNullable: 'YES' },
          email_verified: { dataType: 'tinyint', isNullable: 'NO' },
        },
        indexes: {
          google_sub: { unique: true },
        },
      },
      email_verification_otps: {
        columns: {
          id: { dataType: 'bigint' },
          email: { dataType: 'varchar', isNullable: 'NO' },
          purpose: { dataType: 'enum', columnTypeIncludes: ['VERIFY_EMAIL', 'LOGIN_OTP'], isNullable: 'NO' },
          otp_hash: { dataType: 'varchar', isNullable: 'NO' },
          attempts: { dataType: 'tinyint', isNullable: 'NO' },
          expires_at: { dataType: ['timestamp', 'datetime'], isNullable: 'NO' },
          consumed_at: { dataType: ['timestamp', 'datetime'], isNullable: 'YES' },
          created_at: { dataType: ['timestamp', 'datetime'], isNullable: 'NO' },
        },
        indexes: {
          idx_evo_email_purpose_created: {},
          idx_evo_expires: {},
        },
      },
    },
  },
});

async function verifyMigration027BaselineData(session) {
  const [rows] = await session.query(
    `SELECT symbol, display_name, unit_label, data_class, is_active
     FROM commodity_symbols
     WHERE symbol IN ('WHEAT_GOI', 'SUGAR_GOI', 'EDIBLE_OIL_GOI', 'NAPHTHA_EIA')`
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return ['commodity_symbols contains no reconciled GOI/NAPHTHA_EIA rows to verify migration 027 baseline'];
  }

  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  const failures = [];

  const wheat = bySymbol.get('WHEAT_GOI');
  if (!wheat || wheat.data_class !== 'MARKET_INDICATIVE') {
    failures.push(`commodity_symbols.WHEAT_GOI expected data_class="MARKET_INDICATIVE", got "${wheat ? wheat.data_class : 'missing'}"`);
  }

  const sugar = bySymbol.get('SUGAR_GOI');
  if (!sugar || sugar.display_name !== 'Sugar Wholesale Mandi (India, Agmarknet)' || sugar.data_class !== 'MARKET_INDICATIVE') {
    failures.push(
      `commodity_symbols.SUGAR_GOI expected display_name="Sugar Wholesale Mandi (India, Agmarknet)" and data_class="MARKET_INDICATIVE", got "${sugar ? `${sugar.display_name} (${sugar.data_class})` : 'missing'}"`
    );
  }

  const oil = bySymbol.get('EDIBLE_OIL_GOI');
  if (!oil || oil.unit_label !== 'INR/quintal') {
    failures.push(`commodity_symbols.EDIBLE_OIL_GOI expected unit_label="INR/quintal", got "${oil ? oil.unit_label : 'missing'}"`);
  }

  const naphtha = bySymbol.get('NAPHTHA_EIA');
  if (!naphtha || Number(naphtha.is_active) !== 0) {
    failures.push(`commodity_symbols.NAPHTHA_EIA expected is_active=0, got "${naphtha ? naphtha.is_active : 'missing'}"`);
  }

  return failures;
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function computeMigrationChecksum(filePath, fsModule = fs) {
  const raw = fsModule.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function discoverMigrationFiles(migrationsDir = DEFAULT_MIGRATIONS_DIR, fsModule = fs) {
  const entries = fsModule.readdirSync(migrationsDir);
  return entries
    .filter((name) => typeof name === 'string' && MIGRATION_FILE_PATTERN.test(name))
    .sort();
}

/**
 * Strictly resolve a requested migration identifier to an exact migration filename.
 * Accepts exact filename (`027_reconcile_commodity_symbols_metadata.js`),
 * exact stem (`027_reconcile_commodity_symbols_metadata`), or unambiguous
 * 3-digit prefix (`027`). Rejects traversal, blanks, ambiguity, and unknown IDs.
 */
function resolveMigrationTarget(requestedTarget, { migrationsDir = DEFAULT_MIGRATIONS_DIR, fsModule = fs } = {}) {
  if (typeof requestedTarget !== 'string' || isBlank(requestedTarget)) {
    throw new Error('Migration identifier must be a non-empty string.');
  }

  if (requestedTarget.trim() !== requestedTarget) {
    throw new Error(`Invalid migration identifier "${requestedTarget}": leading/trailing whitespace is not allowed.`);
  }

  if (
    requestedTarget.includes('\0') ||
    requestedTarget.includes('/') ||
    requestedTarget.includes('\\') ||
    requestedTarget.includes('..') ||
    path.basename(requestedTarget) !== requestedTarget
  ) {
    throw new Error(`Rejected unsafe migration identifier "${requestedTarget}": path traversal is forbidden.`);
  }

  const available = discoverMigrationFiles(migrationsDir, fsModule);
  let matchedFile = null;

  if (available.includes(requestedTarget)) {
    matchedFile = requestedTarget;
  } else if (!requestedTarget.endsWith('.js') && available.includes(`${requestedTarget}.js`)) {
    matchedFile = `${requestedTarget}.js`;
  } else if (/^\d{3}$/.test(requestedTarget)) {
    const prefixMatches = available.filter((f) => f.startsWith(`${requestedTarget}_`));
    if (prefixMatches.length === 1) {
      matchedFile = prefixMatches[0];
    } else if (prefixMatches.length > 1) {
      throw new Error(
        `Ambiguous migration identifier "${requestedTarget}": matched ${prefixMatches.join(', ')}. Specify the full filename.`
      );
    }
  }

  if (!matchedFile) {
    throw new Error(`Unknown migration identifier "${requestedTarget}". No matching file exists in ${migrationsDir}.`);
  }

  const modulePath = path.resolve(migrationsDir, matchedFile);
  if (path.dirname(modulePath) !== path.resolve(migrationsDir)) {
    throw new Error(`Resolved migration path for "${matchedFile}" escaped migrations directory.`);
  }

  return {
    filename: matchedFile,
    modulePath,
    checksum: computeMigrationChecksum(modulePath, fsModule),
  };
}

function sanitizeErrorMessage(err) {
  const raw = err && err.message ? String(err.message) : String(err || 'Unknown migration error');
  const redacted = raw
    .replace(/(mysql:\/\/)[^\s@]+@/gi, '$1***@')
    .replace(/\b(db_password|password|pwd|secret|api_key)\s*([:=])\s*(['"]?)([^\s,;'"`]+)\3/gi, '$1$2$3***$3')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const combined = `${PARTIAL_DDL_WARNING_PREFIX}${redacted}`;
  if (combined.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return combined;
  }
  return `${combined.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`;
}

async function ensureLedgerTable(session) {
  await session.query(CREATE_LEDGER_TABLE_SQL);
}

async function getLedgerEntry(session, migrationName) {
  const [rows] = await session.query(
    `SELECT id, migration_name, checksum, status, started_at, applied_at, execution_ms, error_message, created_at, updated_at
     FROM ${LEDGER_TABLE}
     WHERE migration_name = ?
     LIMIT 1`,
    [migrationName]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function listLedgerEntries(session) {
  const [rows] = await session.query(
    `SELECT id, migration_name, checksum, status, started_at, applied_at, execution_ms, error_message, created_at, updated_at
     FROM ${LEDGER_TABLE}
     ORDER BY migration_name ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

async function markRunning(session, { migrationName, checksum }) {
  await session.query(
    `INSERT INTO ${LEDGER_TABLE}
       (migration_name, checksum, status, started_at, applied_at, execution_ms, error_message)
     VALUES (?, ?, 'RUNNING', UTC_TIMESTAMP(), NULL, NULL, NULL)
     ON DUPLICATE KEY UPDATE
       checksum = VALUES(checksum),
       status = 'RUNNING',
       started_at = UTC_TIMESTAMP(),
       applied_at = NULL,
       execution_ms = NULL,
       error_message = NULL`,
    [migrationName, checksum]
  );
}

async function markApplied(session, { migrationName, checksum, executionMs }) {
  const boundedMs = Math.max(0, Math.round(Number(executionMs) || 0));
  await session.query(
    `UPDATE ${LEDGER_TABLE}
     SET checksum = ?,
         status = 'APPLIED',
         applied_at = UTC_TIMESTAMP(),
         execution_ms = ?,
         error_message = NULL
     WHERE migration_name = ?`,
    [checksum, boundedMs, migrationName]
  );
}

async function markFailed(session, { migrationName, checksum, executionMs, errorMessage }) {
  const boundedMs = Math.max(0, Math.round(Number(executionMs) || 0));
  const sanitized = sanitizeErrorMessage(errorMessage);
  await session.query(
    `INSERT INTO ${LEDGER_TABLE}
       (migration_name, checksum, status, started_at, applied_at, execution_ms, error_message)
     VALUES (?, ?, 'FAILED', UTC_TIMESTAMP(), NULL, ?, ?)
     ON DUPLICATE KEY UPDATE
       checksum = VALUES(checksum),
       status = 'FAILED',
       applied_at = NULL,
       execution_ms = VALUES(execution_ms),
       error_message = VALUES(error_message)`,
    [migrationName, checksum, boundedMs, sanitized]
  );
  return sanitized;
}

function normalizeExpectedTypes(expected) {
  return Array.isArray(expected) ? expected.map((t) => t.toLowerCase()) : [String(expected).toLowerCase()];
}

/**
 * Inspect connected database schema via `information_schema` and validate all structural
 * expectations for the requested migration list. Does not rely solely on table existence.
 */
async function validateBaselineSchema(session, migrationNames) {
  const missingSpecs = migrationNames.filter((name) => !Object.prototype.hasOwnProperty.call(BASELINE_SCHEMA_SPECS, name));
  if (missingSpecs.length > 0) {
    throw new Error(
      `Cannot baseline unverified migration(s) without comprehensive schema rules: ${missingSpecs.join(', ')}`
    );
  }

  const [colRows] = await session.query(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()`
  );

  const [indexRows] = await session.query(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()`
  );

  const columnsByTable = new Map();
  for (const row of Array.isArray(colRows) ? colRows : []) {
    if (!columnsByTable.has(row.TABLE_NAME)) {
      columnsByTable.set(row.TABLE_NAME, new Map());
    }
    columnsByTable.get(row.TABLE_NAME).set(row.COLUMN_NAME, row);
  }

  const indexesByTable = new Map();
  for (const row of Array.isArray(indexRows) ? indexRows : []) {
    if (!indexesByTable.has(row.TABLE_NAME)) {
      indexesByTable.set(row.TABLE_NAME, new Map());
    }
    indexesByTable.get(row.TABLE_NAME).set(row.INDEX_NAME, row);
  }

  const failures = [];
  let checksPerformed = 0;

  for (const migrationName of migrationNames) {
    const spec = BASELINE_SCHEMA_SPECS[migrationName];
    const tables = spec.tables || {};

    for (const [tableName, tableSpec] of Object.entries(tables)) {
      checksPerformed += 1;
      const tableCols = columnsByTable.get(tableName);
      if (!tableCols) {
        failures.push(`[${migrationName}] Missing required table "${tableName}"`);
        continue;
      }

      for (const [colName, colRule] of Object.entries(tableSpec.columns || {})) {
        checksPerformed += 1;
        const actual = tableCols.get(colName);
        if (!actual) {
          failures.push(`[${migrationName}] Missing column "${tableName}.${colName}"`);
          continue;
        }

        const actualType = String(actual.DATA_TYPE || '').toLowerCase();
        if (colRule.dataType) {
          const allowedTypes = normalizeExpectedTypes(colRule.dataType);
          if (!allowedTypes.includes(actualType)) {
            failures.push(
              `[${migrationName}] Column "${tableName}.${colName}" expected DATA_TYPE in [${allowedTypes.join(',')}], got "${actual.DATA_TYPE}"`
            );
          }
        }

        if (colRule.isNullable) {
          const actualNullable = String(actual.IS_NULLABLE || '').toUpperCase();
          if (actualNullable !== colRule.isNullable) {
            failures.push(
              `[${migrationName}] Column "${tableName}.${colName}" expected IS_NULLABLE="${colRule.isNullable}", got "${actual.IS_NULLABLE}"`
            );
          }
        }

        if (Object.prototype.hasOwnProperty.call(colRule, 'columnDefault')) {
          const actualDefault = actual.COLUMN_DEFAULT !== null && actual.COLUMN_DEFAULT !== undefined
            ? String(actual.COLUMN_DEFAULT).trim()
            : null;
          if (actualDefault !== colRule.columnDefault) {
            failures.push(
              `[${migrationName}] Column "${tableName}.${colName}" expected COLUMN_DEFAULT="${colRule.columnDefault}", got "${actual.COLUMN_DEFAULT}"`
            );
          }
        }

        if (Array.isArray(colRule.columnTypeIncludes)) {
          const actualColType = String(actual.COLUMN_TYPE || '').toLowerCase();
          for (const token of colRule.columnTypeIncludes) {
            if (!actualColType.includes(String(token).toLowerCase())) {
              failures.push(
                `[${migrationName}] Column "${tableName}.${colName}" COLUMN_TYPE "${actual.COLUMN_TYPE}" missing "${token}"`
              );
            }
          }
        }
      }

      const tableIndexes = indexesByTable.get(tableName) || new Map();
      for (const [indexName, indexRule] of Object.entries(tableSpec.indexes || {})) {
        checksPerformed += 1;
        const actualIdx = tableIndexes.get(indexName);
        if (!actualIdx) {
          failures.push(`[${migrationName}] Missing required index "${tableName}.${indexName}"`);
          continue;
        }
        if (indexRule.unique && Number(actualIdx.NON_UNIQUE) !== 0) {
          failures.push(`[${migrationName}] Index "${tableName}.${indexName}" must be UNIQUE (NON_UNIQUE=${actualIdx.NON_UNIQUE})`);
        }
      }
    }

    if (typeof spec.verifyCustom === 'function') {
      checksPerformed += 1;
      const customFailures = await spec.verifyCustom(session);
      for (const msg of customFailures) {
        failures.push(`[${migrationName}] ${msg}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Baseline schema validation failed (${failures.length} mismatch(es)):\n- ${failures.join('\n- ')}`
    );
  }

  return {
    valid: true,
    checkedMigrations: migrationNames.length,
    checksPerformed,
  };
}

/**
 * Baseline an already-provisioned database up to a specified migration without executing
 * historical migration SQL. Validates the entire target schema first and refuses to
 * overwrite FAILED or RUNNING ledger entries.
 */
async function baselineMigrations(
  session,
  { upTo, migrationsDir = DEFAULT_MIGRATIONS_DIR, fsModule = fs }
) {
  const resolvedEnd = resolveMigrationTarget(upTo, { migrationsDir, fsModule });
  const allFiles = discoverMigrationFiles(migrationsDir, fsModule);
  const endIdx = allFiles.indexOf(resolvedEnd.filename);
  const targetFiles = allFiles.slice(0, endIdx + 1);

  await ensureLedgerTable(session);

  const existingEntries = await listLedgerEntries(session);
  const existingByName = new Map(existingEntries.map((row) => [row.migration_name, row]));

  const conflicts = [];
  for (const file of targetFiles) {
    const existing = existingByName.get(file);
    if (!existing) continue;
    if (existing.status === STATUSES.FAILED || existing.status === STATUSES.RUNNING) {
      conflicts.push(`${file} (status=${existing.status})`);
    }
  }
  if (conflicts.length > 0) {
    throw new Error(
      `Refusing baseline: target range contains non-APPLIED ledger entry/entries requiring investigation: ${conflicts.join(', ')}`
    );
  }

  const schemaSummary = await validateBaselineSchema(session, targetFiles);

  const recorded = [];
  const skippedAlreadyApplied = [];
  const useTransaction = typeof session.beginTransaction === 'function'
    && typeof session.commit === 'function'
    && typeof session.rollback === 'function';

  if (useTransaction) {
    await session.beginTransaction();
  }

  try {
    for (const file of targetFiles) {
      const filePath = path.resolve(migrationsDir, file);
      const checksum = computeMigrationChecksum(filePath, fsModule);
      const existing = existingByName.get(file);

      if (existing && existing.status === STATUSES.APPLIED) {
        skippedAlreadyApplied.push({
          migrationName: file,
          checksumChanged: existing.checksum !== checksum,
        });
        continue;
      }

      await session.query(
        `INSERT INTO ${LEDGER_TABLE}
           (migration_name, checksum, status, started_at, applied_at, execution_ms, error_message)
         VALUES (?, ?, 'APPLIED', UTC_TIMESTAMP(), UTC_TIMESTAMP(), 0, NULL)`,
        [file, checksum]
      );
      recorded.push(file);
    }

    if (useTransaction) {
      await session.commit();
    }
  } catch (err) {
    if (useTransaction) {
      try {
        await session.rollback();
      } catch (_) {}
    }
    throw err;
  }

  return {
    upTo: resolvedEnd.filename,
    checkedMigrations: schemaSummary.checkedMigrations,
    checksPerformed: schemaSummary.checksPerformed,
    recorded,
    skippedAlreadyApplied,
  };
}

module.exports = {
  LEDGER_TABLE,
  STATUSES,
  DEFAULT_MIGRATIONS_DIR,
  MIGRATION_FILE_PATTERN,
  DEFAULT_LOCK_WAIT_TIMEOUT_SECONDS,
  PARTIAL_DDL_WARNING_PREFIX,
  CREATE_LEDGER_TABLE_SQL,
  BASELINE_SCHEMA_SPECS,
  computeMigrationChecksum,
  discoverMigrationFiles,
  resolveMigrationTarget,
  sanitizeErrorMessage,
  ensureLedgerTable,
  getLedgerEntry,
  listLedgerEntries,
  markRunning,
  markApplied,
  markFailed,
  validateBaselineSchema,
  baselineMigrations,
};
