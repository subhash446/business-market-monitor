'use strict';

/**
 * Migration 029 — T-06: WhatsApp Alert Channel (FR-ALERT-07).
 *
 * Adds multi-channel alert delivery schema support:
 *   1. `alert_rules`:
 *      - notification_channel: ENUM('EMAIL', 'WHATSAPP', 'BOTH') NOT NULL DEFAULT 'EMAIL'
 *      - destination_phone: VARCHAR(30) NULL DEFAULT NULL
 *
 *   2. `alert_events`:
 *      - notification_channel: widened to ENUM('EMAIL', 'WHATSAPP') NOT NULL DEFAULT 'EMAIL'
 *      - recipient_phone_snapshot: VARCHAR(30) NULL DEFAULT NULL
 *
 * Backward-compatibility:
 *   - All existing alert rules default to 'EMAIL' and NULL phone.
 *   - Historical alert events remain valid with 'EMAIL' and NULL recipient phone snapshot.
 *   - Idempotent via information_schema.COLUMNS checks.
 */

async function up(pool) {
  // 1. alert_rules: add notification_channel and destination_phone if not present
  const [ruleCols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'alert_rules'
       AND COLUMN_NAME = 'destination_phone'`
  );

  if (ruleCols[0].cnt === 0) {
    await pool.query(`
      ALTER TABLE alert_rules
        ADD COLUMN notification_channel ENUM('EMAIL','WHATSAPP','BOTH') NOT NULL DEFAULT 'EMAIL' AFTER cooldown_hours,
        ADD COLUMN destination_phone    VARCHAR(30) NULL DEFAULT NULL AFTER notification_channel
    `);
    console.log('[migrate] Added notification_channel and destination_phone to alert_rules');
  } else {
    console.log('[migrate] alert_rules WhatsApp columns already present — skipping');
  }

  // 2. alert_events: widen notification_channel ENUM and add recipient_phone_snapshot if not present
  const [eventCols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'alert_events'
       AND COLUMN_NAME = 'recipient_phone_snapshot'`
  );

  if (eventCols[0].cnt === 0) {
    await pool.query(`
      ALTER TABLE alert_events
        MODIFY COLUMN notification_channel    ENUM('EMAIL','WHATSAPP') NOT NULL DEFAULT 'EMAIL',
        ADD COLUMN recipient_phone_snapshot  VARCHAR(30) NULL DEFAULT NULL AFTER notification_channel
    `);
    console.log('[migrate] Widened alert_events.notification_channel to ENUM(\'EMAIL\',\'WHATSAPP\') and added recipient_phone_snapshot');
  } else {
    console.log('[migrate] alert_events WhatsApp columns already present — skipping');
  }
}

async function down(pool) {
  // 1. alert_rules: drop destination_phone and notification_channel
  const [ruleCols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'alert_rules'
       AND COLUMN_NAME = 'destination_phone'`
  );

  if (ruleCols[0].cnt > 0) {
    await pool.query(`
      ALTER TABLE alert_rules
        DROP COLUMN destination_phone,
        DROP COLUMN notification_channel
    `);
    console.log('[migrate] Rolled back alert_rules notification_channel and destination_phone');
  }

  // 2. alert_events: drop recipient_phone_snapshot and revert notification_channel to ENUM('EMAIL')
  const [eventCols] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'alert_events'
       AND COLUMN_NAME = 'recipient_phone_snapshot'`
  );

  if (eventCols[0].cnt > 0) {
    await pool.query(`
      ALTER TABLE alert_events
        DROP COLUMN recipient_phone_snapshot,
        MODIFY COLUMN notification_channel ENUM('EMAIL') NOT NULL DEFAULT 'EMAIL'
    `);
    console.log('[migrate] Rolled back alert_events recipient_phone_snapshot and reverted notification_channel');
  }
}

module.exports = { up, down };
