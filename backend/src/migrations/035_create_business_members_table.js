'use strict';

/**
 * Migration 035 — V3 Milestone 5: Commercial SaaS Layer
 * Multi-User Workspace & Role-Based Access Control (RBAC).
 *
 * Adds:
 *   1. `business_members` table:
 *      - Stores workspace members with granular roles ('OWNER', 'PURCHASE_MANAGER', 'VIEWER').
 *      - Supports secure invite token workflow (SHA-256 hash, 7-day expiration).
 *      - Tracks active, invited, and revoked states.
 *   2. Zero-Breakage Backfill:
 *      - Automatically and idempotently backfills all existing businesses.user_id
 *        as 'ACTIVE' 'OWNER' members so all existing accounts and test fixtures keep working.
 */

async function up(pool) {
  const [tableExists] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'business_members'`
  );

  if (tableExists[0].cnt === 0) {
    await pool.query(`
      CREATE TABLE business_members (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        business_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NULL DEFAULT NULL,
        invited_email VARCHAR(255) NOT NULL,
        role ENUM('OWNER', 'PURCHASE_MANAGER', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
        status ENUM('ACTIVE', 'INVITED', 'REVOKED') NOT NULL DEFAULT 'INVITED',
        invite_token_hash VARCHAR(64) NULL DEFAULT NULL,
        invite_expires_at TIMESTAMP NULL DEFAULT NULL,
        invited_by BIGINT UNSIGNED NULL DEFAULT NULL,
        accepted_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_biz_member_active_user (business_id, user_id),
        KEY idx_biz_member_token_hash (invite_token_hash),
        KEY idx_biz_member_user_status (user_id, status),
        KEY idx_biz_member_email_status (invited_email, status),
        KEY idx_biz_member_biz_role (business_id, role, status),
        CONSTRAINT fk_bm_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        CONSTRAINT fk_bm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_bm_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[migrate] Created business_members table');

    // Zero-Breakage Backfill: Seed existing business creators as active owners
    await pool.query(`
      INSERT IGNORE INTO business_members (business_id, user_id, invited_email, role, status, accepted_at)
      SELECT b.id, b.user_id, u.email, 'OWNER', 'ACTIVE', b.created_at
      FROM businesses b
      JOIN users u ON u.id = b.user_id;
    `);
    console.log('[migrate] Backfilled existing business owners into business_members table');
  } else {
    console.log('[migrate] business_members table already exists — skipping');
  }
}

async function down(pool) {
  const [tableExists] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'business_members'`
  );

  if (tableExists[0].cnt > 0) {
    await pool.query('DROP TABLE IF EXISTS business_members');
    console.log('[migrate] Dropped business_members table');
  } else {
    console.log('[migrate] business_members table already absent — skipping');
  }
}

module.exports = { up, down };
