'use strict';

/**
 * Migration 034 — V3 Milestone 4: Two-Way WhatsApp Quote Capture & Negotiation Copilot.
 *
 * Adds:
 *   1. `whatsapp_inbound_messages` table:
 *      - Stores inbound WhatsApp and in-app supplier quote messages.
 *      - Deduped via external_message_id (Meta `wamid` or `inapp_<uuid>`).
 *      - Preserves privacy: masked phone number + SHA-256 phone hash (no raw plaintext PII).
 *      - Captures extracted material, price, unit, supplier, parity counter-offer bounds,
 *        and logged price_points foreign key reference.
 *
 * Tech Lead Refinements Enforced:
 *   - Idempotent up() and down() using information_schema checks.
 *   - Strict foreign keys to businesses, tracked_materials, and price_points with cascade/set null.
 */

async function up(pool) {
  const [tableExists] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'whatsapp_inbound_messages'`
  );

  if (tableExists[0].cnt === 0) {
    await pool.query(`
      CREATE TABLE whatsapp_inbound_messages (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        business_id BIGINT UNSIGNED NOT NULL,
        external_message_id VARCHAR(100) NOT NULL,
        sender_phone_masked VARCHAR(30) NOT NULL,
        sender_phone_hash VARCHAR(64) NOT NULL,
        raw_text TEXT NOT NULL,
        parsed_material_id BIGINT UNSIGNED NULL DEFAULT NULL,
        parsed_price DECIMAL(12,4) NULL DEFAULT NULL,
        parsed_currency VARCHAR(10) NULL DEFAULT 'INR',
        parsed_unit VARCHAR(20) NULL DEFAULT NULL,
        parsed_supplier_name VARCHAR(100) NULL DEFAULT NULL,
        logged_price_point_id BIGINT UNSIGNED NULL DEFAULT NULL,
        suggested_counter_low DECIMAL(12,4) NULL DEFAULT NULL,
        suggested_counter_high DECIMAL(12,4) NULL DEFAULT NULL,
        processing_status ENUM('PARSED', 'UNRECOGNIZED', 'FAILED') NOT NULL DEFAULT 'PARSED',
        reply_status ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_whatsapp_inbound_external_id (external_message_id),
        KEY idx_whatsapp_inbound_biz_created (business_id, created_at DESC),
        KEY idx_whatsapp_inbound_sender_hash (sender_phone_hash),
        CONSTRAINT fk_waim_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        CONSTRAINT fk_waim_material FOREIGN KEY (parsed_material_id) REFERENCES tracked_materials(id) ON DELETE SET NULL,
        CONSTRAINT fk_waim_price_point FOREIGN KEY (logged_price_point_id) REFERENCES price_points(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[migrate] Created whatsapp_inbound_messages table');
  } else {
    console.log('[migrate] whatsapp_inbound_messages table already exists — skipping');
  }
}

async function down(pool) {
  const [tableExists] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'whatsapp_inbound_messages'`
  );

  if (tableExists[0].cnt > 0) {
    await pool.query('DROP TABLE IF EXISTS whatsapp_inbound_messages');
    console.log('[migrate] Dropped whatsapp_inbound_messages table');
  } else {
    console.log('[migrate] whatsapp_inbound_messages table already absent — skipping');
  }
}

module.exports = { up, down };
