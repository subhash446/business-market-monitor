'use strict';

/**
 * Unit & Idempotency tests for Migration 031 (V3-M1: Inventory Profile Management).
 */

const migration031 = require('../src/migrations/031_add_inventory_profile_to_tracked_materials');
const { BASELINE_SCHEMA_SPECS } = require('../src/database/migrationLedger');

describe('Migration 031 — V3-M1: Inventory Profile for Tracked Materials', () => {
  let mockPool;
  let executedQueries;

  beforeEach(() => {
    executedQueries = [];
    mockPool = {
      query: jest.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        // Default behavior: column does not exist
        if (sql.includes('information_schema.COLUMNS')) {
          return [[{ cnt: 0 }]];
        }
        return [[]];
      }),
    };
  });

  test('up(pool) adds all 5 inventory profile columns when none exist', async () => {
    await migration031.up(mockPool);

    // 5 checks + 5 alters = 10 queries
    expect(mockPool.query).toHaveBeenCalledTimes(10);

    const alters = executedQueries.filter((q) => q.sql.includes('ALTER TABLE tracked_materials'));
    expect(alters).toHaveLength(5);
    expect(alters[0].sql).toContain('current_stock_qty DECIMAL(12, 4)');
    expect(alters[1].sql).toContain('daily_consumption_rate DECIMAL(12, 4)');
    expect(alters[2].sql).toContain('supplier_lead_time_days INT UNSIGNED');
    expect(alters[3].sql).toContain('max_storage_days INT UNSIGNED');
    expect(alters[4].sql).toContain('inventory_updated_at DATETIME');
  });

  test('up(pool) skips column creation idempotently when columns already exist', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]]; // All columns already exist
      }
      return [[]];
    });

    await migration031.up(mockPool);

    // 5 checks, 0 alters
    expect(mockPool.query).toHaveBeenCalledTimes(5);
    const alters = executedQueries.filter((q) => q.sql.includes('ALTER TABLE tracked_materials'));
    expect(alters).toHaveLength(0);
  });

  test('down(pool) drops all 5 columns when they exist', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]]; // Columns exist to drop
      }
      return [[]];
    });

    await migration031.down(mockPool);

    // 5 checks + 5 drops = 10 queries
    expect(mockPool.query).toHaveBeenCalledTimes(10);
    const drops = executedQueries.filter((q) => q.sql.includes('DROP COLUMN'));
    expect(drops).toHaveLength(5);
  });

  test('down(pool) skips drop idempotently when columns do not exist', async () => {
    await migration031.down(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(5);
    const drops = executedQueries.filter((q) => q.sql.includes('DROP COLUMN'));
    expect(drops).toHaveLength(0);
  });

  test('migrationLedger BASELINE_SCHEMA_SPECS registers 031 with exact column types', () => {
    const spec = BASELINE_SCHEMA_SPECS['031_add_inventory_profile_to_tracked_materials.js'];
    expect(spec).toBeDefined();
    expect(spec.tables.tracked_materials).toBeDefined();

    const cols = spec.tables.tracked_materials.columns;
    expect(cols.current_stock_qty.dataType).toBe('decimal');
    expect(cols.daily_consumption_rate.dataType).toBe('decimal');
    expect(cols.supplier_lead_time_days.isNullable).toBe('YES');
    expect(cols.max_storage_days.isNullable).toBe('YES');
    expect(cols.inventory_updated_at.isNullable).toBe('YES');
  });
});
