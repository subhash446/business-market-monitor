'use strict';

/**
 * Migration 031 — V3 Milestone 1: Inventory-Aware Buy Quantity & Timing Engine.
 *
 * Adds 5 inventory profile columns to `tracked_materials`:
 *   - current_stock_qty: DECIMAL(12, 4) NULL DEFAULT NULL
 *   - daily_consumption_rate: DECIMAL(12, 4) NULL DEFAULT NULL
 *   - supplier_lead_time_days: INT UNSIGNED NULL DEFAULT NULL
 *   - max_storage_days: INT UNSIGNED NULL DEFAULT NULL
 *   - inventory_updated_at: DATETIME NULL DEFAULT NULL
 *
 * Design decisions:
 *   - Additive & backward-compatible: all columns default to NULL.
 *   - Idempotent: checks information_schema.COLUMNS per column in both up() and down().
 */

const INVENTORY_COLUMNS = [
  { name: 'current_stock_qty', sql: 'ADD COLUMN current_stock_qty DECIMAL(12, 4) NULL DEFAULT NULL AFTER external_symbol' },
  { name: 'daily_consumption_rate', sql: 'ADD COLUMN daily_consumption_rate DECIMAL(12, 4) NULL DEFAULT NULL AFTER current_stock_qty' },
  { name: 'supplier_lead_time_days', sql: 'ADD COLUMN supplier_lead_time_days INT UNSIGNED NULL DEFAULT NULL AFTER daily_consumption_rate' },
  { name: 'max_storage_days', sql: 'ADD COLUMN max_storage_days INT UNSIGNED NULL DEFAULT NULL AFTER supplier_lead_time_days' },
  { name: 'inventory_updated_at', sql: 'ADD COLUMN inventory_updated_at DATETIME NULL DEFAULT NULL AFTER max_storage_days' },
];

async function up(pool) {
  for (const col of INVENTORY_COLUMNS) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tracked_materials'
         AND COLUMN_NAME = ?`,
      [col.name]
    );

    if (rows[0].cnt === 0) {
      await pool.query(`ALTER TABLE tracked_materials ${col.sql}`);
      console.log(`[migrate] Added column tracked_materials.${col.name}`);
    } else {
      console.log(`[migrate] Column tracked_materials.${col.name} already exists — skipping`);
    }
  }
}

async function down(pool) {
  for (const col of [...INVENTORY_COLUMNS].reverse()) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'tracked_materials'
         AND COLUMN_NAME = ?`,
      [col.name]
    );

    if (rows[0].cnt > 0) {
      await pool.query(`ALTER TABLE tracked_materials DROP COLUMN ${col.name}`);
      console.log(`[migrate] Dropped column tracked_materials.${col.name}`);
    } else {
      console.log(`[migrate] Column tracked_materials.${col.name} already absent — skipping`);
    }
  }
}

module.exports = { up, down, INVENTORY_COLUMNS };
