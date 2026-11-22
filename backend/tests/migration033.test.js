'use strict';

/**
 * Unit & Idempotency tests for Migration 033 (V3-M3: Live FX Rates & Landed-Cost Configuration).
 */

const migration033 = require('../src/migrations/033_add_fx_rates_and_landed_cost_config');
const { BASELINE_SCHEMA_SPECS } = require('../src/database/migrationLedger');

describe('Migration 033 — V3-M3: Live FX & Landed-Cost Normalization Engine', () => {
  let mockPool;
  let executedQueries;

  beforeEach(() => {
    executedQueries = [];
    mockPool = {
      query: jest.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('information_schema.TABLES')) {
          return [[{ cnt: 0 }]];
        }
        if (sql.includes('information_schema.COLUMNS') && sql.includes("'job_type'")) {
          return [[{ COLUMN_TYPE: "enum('PRICE_INGESTION','NEWS_INGESTION','AI_INSIGHTS','ALERT_EVALUATION','NEWS_DIGEST')" }]];
        }
        if (sql.includes('information_schema.COLUMNS')) {
          return [[{ cnt: 0 }]];
        }
        return [[]];
      }),
    };
  });

  test('up(pool) creates fx_rates table, adds landed-cost columns, and widens sync_statuses.job_type', async () => {
    await migration033.up(mockPool);

    const createFx = executedQueries.filter((q) => q.sql.includes('CREATE TABLE fx_rates'));
    expect(createFx).toHaveLength(1);
    expect(createFx[0].sql).toContain('rate DECIMAL(12, 6)');
    expect(createFx[0].sql).toContain('uq_fx_rates_pair_date');

    const alters = executedQueries.filter((q) => q.sql.includes('ALTER TABLE tracked_materials'));
    expect(alters).toHaveLength(4);
    expect(alters[0].sql).toContain('landed_unit_factor DECIMAL(14, 6)');
    expect(alters[1].sql).toContain('landed_duty_freight_pct DECIMAL(6, 2)');
    expect(alters[2].sql).toContain('landed_fixed_spread_inr DECIMAL(12, 2)');
    expect(alters[3].sql).toContain('landed_config_updated_at DATETIME');

    const syncAlter = executedQueries.filter((q) => q.sql.includes('ALTER TABLE sync_statuses'));
    expect(syncAlter).toHaveLength(1);
    expect(syncAlter[0].sql).toContain('FX_INGESTION');
  });

  test('up(pool) skips table creation and alterations idempotently when already applied', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 1 }]]; // fx_rates exists
      }
      if (sql.includes('information_schema.COLUMNS') && sql.includes("'job_type'")) {
        return [[{ COLUMN_TYPE: "enum('PRICE_INGESTION','NEWS_INGESTION','AI_INSIGHTS','ALERT_EVALUATION','NEWS_DIGEST','FX_INGESTION')" }]];
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]]; // Columns already exist
      }
      return [[]];
    });

    await migration033.up(mockPool);

    const createFx = executedQueries.filter((q) => q.sql.includes('CREATE TABLE fx_rates'));
    expect(createFx).toHaveLength(0);

    const alters = executedQueries.filter((q) => q.sql.includes('ALTER TABLE tracked_materials'));
    expect(alters).toHaveLength(0);

    const syncAlter = executedQueries.filter((q) => q.sql.includes('ALTER TABLE sync_statuses'));
    expect(syncAlter).toHaveLength(0);
  });

  test('down(pool) purges FX_INGESTION sync_statuses rows before narrowing ENUM and drops columns/tables', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 1 }]]; // fx_rates exists
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]]; // Columns exist
      }
      return [[]];
    });

    await migration033.down(mockPool);

    const deleteSync = executedQueries.filter((q) => q.sql.includes('DELETE FROM sync_statuses WHERE job_type = \'FX_INGESTION\''));
    expect(deleteSync).toHaveLength(1);

    const revertSync = executedQueries.filter((q) => q.sql.includes('ALTER TABLE sync_statuses'));
    expect(revertSync).toHaveLength(1);
    expect(revertSync[0].sql).not.toContain('FX_INGESTION');

    const dropCols = executedQueries.filter((q) => q.sql.includes('DROP COLUMN'));
    expect(dropCols).toHaveLength(4);

    const dropTable = executedQueries.filter((q) => q.sql.includes('DROP TABLE IF EXISTS fx_rates'));
    expect(dropTable).toHaveLength(1);
  });

  test('down(pool) skips drops idempotently when columns and tables do not exist', async () => {
    await migration033.down(mockPool);

    const dropCols = executedQueries.filter((q) => q.sql.includes('DROP COLUMN'));
    expect(dropCols).toHaveLength(0);

    const dropTable = executedQueries.filter((q) => q.sql.includes('DROP TABLE IF EXISTS fx_rates'));
    expect(dropTable).toHaveLength(0);
  });

  test('migrationLedger BASELINE_SCHEMA_SPECS registers 033 with exact column and table types', () => {
    const spec = BASELINE_SCHEMA_SPECS['033_add_fx_rates_and_landed_cost_config.js'];
    expect(spec).toBeDefined();
    expect(spec.tables.fx_rates).toBeDefined();
    expect(spec.tables.fx_rates.indexes.uq_fx_rates_pair_date.unique).toBe(true);

    const cols = spec.tables.tracked_materials.columns;
    expect(cols.landed_unit_factor.dataType).toBe('decimal');
    expect(cols.landed_duty_freight_pct.dataType).toBe('decimal');
    expect(cols.landed_fixed_spread_inr.dataType).toBe('decimal');
    expect(cols.landed_config_updated_at.isNullable).toBe('YES');

    expect(spec.tables.sync_statuses.columns.job_type.columnTypeIncludes).toContain('FX_INGESTION');
  });
});
