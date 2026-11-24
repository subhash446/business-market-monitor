'use strict';

/**
 * emailOtp.repository.js — Data access for 6-digit email OTP codes (Migration 036).
 */
const { pool } = require('../database/connection');

async function createOtp({ email, purpose = 'LOGIN_OTP', otpHash, expiresAt }) {
  const [result] = await pool.execute(
    `INSERT INTO email_verification_otps (email, purpose, otp_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [email.toLowerCase().trim(), purpose, otpHash, expiresAt]
  );
  return { id: result.insertId };
}

async function getLatestOtp(email, purpose = 'LOGIN_OTP') {
  const [rows] = await pool.execute(
    `SELECT * FROM email_verification_otps
     WHERE LOWER(email) = LOWER(?) AND purpose = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [email.toLowerCase().trim(), purpose]
  );
  return rows[0] || null;
}

async function getLatestActiveOtp(email, purpose = 'LOGIN_OTP') {
  const [rows] = await pool.execute(
    `SELECT * FROM email_verification_otps
     WHERE LOWER(email) = LOWER(?)
       AND purpose = ?
       AND consumed_at IS NULL
       AND expires_at > UTC_TIMESTAMP()
     ORDER BY created_at DESC
     LIMIT 1`,
    [email.toLowerCase().trim(), purpose]
  );
  return rows[0] || null;
}

async function incrementAttempts(id) {
  await pool.execute(
    'UPDATE email_verification_otps SET attempts = attempts + 1 WHERE id = ?',
    [id]
  );
}

async function markConsumed(id) {
  await pool.execute(
    'UPDATE email_verification_otps SET consumed_at = UTC_TIMESTAMP() WHERE id = ?',
    [id]
  );
}

module.exports = {
  createOtp,
  getLatestOtp,
  getLatestActiveOtp,
  incrementAttempts,
  markConsumed,
};
