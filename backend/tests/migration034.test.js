'use strict';

/**
 * Unit & Idempotency tests for Migration 034 (V3-M4: WhatsApp Inbound Messages Table).
 */

const migration034 = require('../src/migrations/034_create_whatsapp_inbound_messages_table');
const { BASELINE_SCHEMA_SPECS } = require('../src/database/migrationLedger');

describe('Migration 034 — V3-M4: WhatsApp Inbound Messages Table', () => {
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
        return [[]];
      }),
    };
  });

  test('up(pool) creates whatsapp_inbound_messages table with indexes and constraints', async () => {
    await migration034.up(mockPool);

    const createTable = executedQueries.filter((q) => q.sql.includes('CREATE TABLE whatsapp_inbound_messages'));
    expect(createTable).toHaveLength(1);
    expect(createTable[0].sql).toContain('external_message_id VARCHAR(100)');
    expect(createTable[0].sql).toContain('sender_phone_masked VARCHAR(30)');
    expect(createTable[0].sql).toContain('sender_phone_hash VARCHAR(64)');
    expect(createTable[0].sql).toContain('uq_whatsapp_inbound_external_id');
    expect(createTable[0].sql).toContain('fk_waim_business');
    expect(createTable[0].sql).toContain('fk_waim_material');
    expect(createTable[0].sql).toContain('fk_waim_price_point');
  });

  test('up(pool) skips table creation idempotently when already applied', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 1 }]]; // Table already exists
      }
      return [[]];
    });

    await migration034.up(mockPool);

    const createTable = executedQueries.filter((q) => q.sql.includes('CREATE TABLE whatsapp_inbound_messages'));
    expect(createTable).toHaveLength(0);
  });

  test('down(pool) drops whatsapp_inbound_messages table cleanly', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 1 }]]; // Table exists to drop
      }
      return [[]];
    });

    await migration034.down(mockPool);

    const dropTable = executedQueries.filter((q) => q.sql.includes('DROP TABLE IF EXISTS whatsapp_inbound_messages'));
    expect(dropTable).toHaveLength(1);
  });

  test('down(pool) skips drop idempotently when table is already absent', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 0 }]]; // Table absent
      }
      return [[]];
    });

    await migration034.down(mockPool);

    const dropTable = executedQueries.filter((q) => q.sql.includes('DROP TABLE IF EXISTS whatsapp_inbound_messages'));
    expect(dropTable).toHaveLength(0);
  });

  test('migrationLedger.js defines BASELINE_SCHEMA_SPECS entry for 034', () => {
    const spec = BASELINE_SCHEMA_SPECS['034_create_whatsapp_inbound_messages_table.js'];
    expect(spec).toBeDefined();
    expect(spec.tables.whatsapp_inbound_messages).toBeDefined();

    const cols = spec.tables.whatsapp_inbound_messages.columns;
    expect(cols.business_id).toBeDefined();
    expect(cols.external_message_id).toBeDefined();
    expect(cols.sender_phone_masked).toBeDefined();
    expect(cols.sender_phone_hash).toBeDefined();
    expect(cols.raw_text).toBeDefined();
    expect(cols.processing_status).toBeDefined();
    expect(cols.reply_status).toBeDefined();

    const indexes = spec.tables.whatsapp_inbound_messages.indexes;
    expect(indexes.uq_whatsapp_inbound_external_id.unique).toBe(true);
  });
});
