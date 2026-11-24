'use strict';

/**
 * Migration 036 — Google OAuth 2.0 & 6-Digit Email OTP Verification.
 *
 * Adds:
 *   1. Updates to `users` table:
 *      - `password_hash`: modified to VARCHAR(255) NULL (allows Google/OTP accounts without password).
 *      - `auth_provider`: ENUM('LOCAL', 'GOOGLE', 'EMAIL_OTP') NOT NULL DEFAULT 'LOCAL'.
 *      - `google_sub`: VARCHAR(128) NULL UNIQUE (Google Subject ID).
 *      - `email_verified`: TINYINT(1) NOT NULL DEFAULT 0.
 *      - Zero-Breakage Backfill: Backfills all existing users with email_verified = 1.
 *   2. `email_verification_otps` table:
 *      - Stores SHA-256 hashed 6-digit OTP codes, purpose, attempt counters, and expiration.
 *      - Indexed by (email, purpose, created_at DESC) and (expires_at).
 */

const USER_COLUMNS = [
  {
    name: 'auth_provider',
    sql: "ADD COLUMN auth_provider ENUM('LOCAL', 'GOOGLE', 'EMAIL_OTP') NOT NULL DEFAULT 'LOCAL' AFTER password_hash",
  },
  {
    name: 'google_sub',
    sql: 'ADD COLUMN google_sub VARCHAR(128) NULL UNIQUE AFTER auth_provider',
  },
  {
    name: 'email_verified',
    sql: 'ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER google_sub',
  },
];

async function up(pool) {
  // 1. Modify users.password_hash to allow NULL
  const [pwdCol] = await pool.query(
    `SELECT IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'password_hash'`
  );

  if (pwdCol[0] && pwdCol[0].IS_NULLABLE === 'NO') {
    await pool.query('ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL DEFAULT NULL');
    console.log('[migrate] Modified users.password_hash to allow NULL');
  } else {
    console.log('[migrate] users.password_hash already nullable or absent — skipping');
  }

  // 2. Add columns to users table
  for (const col of USER_COLUMNS) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = ?`,
      [col.name]
    );

    if (rows[0].cnt === 0) {
      await pool.query(`ALTER TABLE users ${col.sql}`);
      console.log(`[migrate] Added column users.${col.name}`);
    } else {
      console.log(`[migrate] Column users.${col.name} already exists — skipping`);
    }
  }

  // 3. Zero-Breakage Backfill: Ensure existing users are marked email_verified = 1
  await pool.query('UPDATE users SET email_verified = 1 WHERE email_verified = 0');
  console.log('[migrate] Backfilled existing users with email_verified = 1');

  // 4. Create email_verification_otps table
  const [otpTable] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'email_verification_otps'`
  );

  if (otpTable[0].cnt === 0) {
    await pool.query(`
      CREATE TABLE email_verification_otps (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        purpose ENUM('VERIFY_EMAIL', 'LOGIN_OTP') NOT NULL DEFAULT 'LOGIN_OTP',
        otp_hash VARCHAR(64) NOT NULL,
        attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        consumed_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_evo_email_purpose_created (email, purpose, created_at DESC),
        KEY idx_evo_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[migrate] Created email_verification_otps table');
  } else {
    console.log('[migrate] email_verification_otps table already exists — skipping');
  }
}

async function down(pool) {
  // 1. Drop email_verification_otps table
  const [otpTable] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'email_verification_otps'`
  );

  if (otpTable[0].cnt > 0) {
    await pool.query('DROP TABLE IF EXISTS email_verification_otps');
    console.log('[migrate] Dropped email_verification_otps table');
  } else {
    console.log('[migrate] email_verification_otps table already absent — skipping');
  }

  // 2. Drop added columns from users table in reverse
  for (const col of [...USER_COLUMNS].reverse()) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = ?`,
      [col.name]
    );

    if (rows[0].cnt > 0) {
      await pool.query(`ALTER TABLE users DROP COLUMN ${col.name}`);
      console.log(`[migrate] Dropped column users.${col.name}`);
    } else {
      console.log(`[migrate] Column users.${col.name} already absent — skipping`);
    }
  }

  // 3. Restore password_hash to NOT NULL safely
  const [pwdCol] = await pool.query(
    `SELECT IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'password_hash'`
  );

  if (pwdCol[0] && pwdCol[0].IS_NULLABLE === 'YES') {
    await pool.query("UPDATE users SET password_hash = '' WHERE password_hash IS NULL");
    await pool.query('ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL');
    console.log('[migrate] Restored users.password_hash to NOT NULL');
  }
}

module.exports = { up, down };
