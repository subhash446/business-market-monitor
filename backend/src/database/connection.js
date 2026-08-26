/**
 * MySQL connection pool (Document 4 — MySQL 8.0.16+, Document 3 §15 Render
 * Managed MySQL). Pool creation is lazy/non-blocking — the app can start
 * even if the database isn't reachable yet; testConnection() below is used
 * at boot only to log connectivity, never to block startup (Phase 1 skeleton).
 *
 * SSL (Production Hardening Phase A, finding D4): optional, controlled by
 * DB_SSL_ENABLED — off by default, so local/dev setups (including this
 * project's own MySQL 8 dev instance) are completely unaffected unless a
 * deployment explicitly opts in. When enabled, DB_SSL_REJECT_UNAUTHORIZED
 * controls certificate strictness (default true; some managed providers'
 * minimal CA chains require setting this false — an operational choice,
 * not a code change).
 */
const mysql = require('mysql2/promise');
const env = require('../config/env');
const logger = require('../utils/logger');

const poolConfig = {
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  waitForConnections: true,
  connectionLimit: 10,
};

if (env.db.sslEnabled) {
  poolConfig.ssl = { rejectUnauthorized: env.db.sslRejectUnauthorized };
}

const pool = mysql.createPool(poolConfig);

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    logger.info(`[database] MySQL connection successful (SSL: ${env.db.sslEnabled ? 'enabled' : 'disabled'})`);
    return true;
  } catch (err) {
    logger.warn('[database] MySQL connection failed — continuing to start (Phase 1 skeleton):', err.message);
    return false;
  }
}

module.exports = { pool, testConnection };
