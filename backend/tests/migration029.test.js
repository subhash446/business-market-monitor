'use strict';

/**
 * Unit & Idempotency tests for Migration 029 (T-06: WhatsApp Alert Channel).
 * Uses a mock database pool to verify query shape, column existence checks, and idempotency.
 */

const migration029 = require('../src/migrations/029_add_whatsapp_alert_channel');

describe('Migration 029 — T-06: WhatsApp Alert Channel (FR-ALERT-07)', () => {
  let mockPool;
  let executedQueries;

  beforeEach(() => {
    executedQueries = [];
    mockPool = {
      query: jest.fn(async (sql) => {
        executedQueries.push(sql);
        // Default behavior: column does not exist
        if (sql.includes('information_schema.COLUMNS')) {
          return [[{ cnt: 0 }]];
        }
        return [[]];
      }),
    };
  });

  test('up(pool) adds columns when destination_phone and recipient_phone_snapshot do not exist', async () => {
    await migration029.up(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(4);
    // Rule check + Rule alter + Event check + Event alter
    expect(executedQueries[0]).toContain('information_schema.COLUMNS');
    expect(executedQueries[0]).toContain('alert_rules');
    expect(executedQueries[1]).toContain('ALTER TABLE alert_rules');
    expect(executedQueries[1]).toContain('ADD COLUMN notification_channel ENUM(\'EMAIL\',\'WHATSAPP\',\'BOTH\')');
    expect(executedQueries[1]).toContain('ADD COLUMN destination_phone    VARCHAR(30)');

    expect(executedQueries[2]).toContain('information_schema.COLUMNS');
    expect(executedQueries[2]).toContain('alert_events');
    expect(executedQueries[3]).toContain('ALTER TABLE alert_events');
    expect(executedQueries[3]).toContain('MODIFY COLUMN notification_channel    ENUM(\'EMAIL\',\'WHATSAPP\')');
    expect(executedQueries[3]).toContain('ADD COLUMN recipient_phone_snapshot  VARCHAR(30)');
  });

  test('up(pool) skips ALTER TABLE idempotently when columns already exist', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      executedQueries.push(sql);
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]];
      }
      return [[]];
    });

    await migration029.up(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(executedQueries[0]).toContain('information_schema.COLUMNS');
    expect(executedQueries[1]).toContain('information_schema.COLUMNS');
    expect(executedQueries.some((q) => q.includes('ALTER TABLE'))).toBe(false);
  });

  test('down(pool) drops columns when columns exist', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      executedQueries.push(sql);
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]];
      }
      return [[]];
    });

    await migration029.down(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(4);
    expect(executedQueries[1]).toContain('ALTER TABLE alert_rules');
    expect(executedQueries[1]).toContain('DROP COLUMN destination_phone');
    expect(executedQueries[1]).toContain('DROP COLUMN notification_channel');

    expect(executedQueries[3]).toContain('ALTER TABLE alert_events');
    expect(executedQueries[3]).toContain('DROP COLUMN recipient_phone_snapshot');
    expect(executedQueries[3]).toContain('MODIFY COLUMN notification_channel ENUM(\'EMAIL\')');
  });

  test('down(pool) skips DROP COLUMN idempotently when columns do not exist', async () => {
    mockPool.query.mockImplementation(async (sql) => {
      executedQueries.push(sql);
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 0 }]];
      }
      return [[]];
    });

    await migration029.down(mockPool);

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(executedQueries.some((q) => q.includes('ALTER TABLE'))).toBe(false);
  });
});
