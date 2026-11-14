'use strict';

/**
 * BMM Backend Test Isolation Bootstrap
 *
 * Enforces strict isolation during Jest execution:
 * 1. Blocks reading `.env`, `.env.*`, certificates (`certs/`, `.pem`, `.crt`, `.key`), and secret files via fs guards.
 * 2. Overrides dotenv so `.env` is never loaded from disk into process.env.
 * 3. Populates process.env with safe, synthetic dummy test values.
 * 4. Intercepts mysql2/promise `createPool` to return a safe mock pool, preventing real database connections.
 * 5. Guards global outbound network fetch calls.
 * 6. Prevents test runs from modifying untracked log files (backend/logs/app.log).
 */

const fs = require('fs');

// ---------------------------------------------------------------------------
// 1. Filesystem Secret & Certificate Guard
// ---------------------------------------------------------------------------
function isSecretOrCertPath(filePath) {
  if (typeof filePath !== 'string' && !Buffer.isBuffer(filePath)) {
    return false;
  }
  const normalized = String(filePath).replace(/\\/g, '/').toLowerCase();
  const isEnvFile = /(?:^|\/)\.env(?:\.|$)/.test(normalized) || normalized.endsWith('.env');
  const isCertFile =
    normalized.includes('/certs/') ||
    normalized.endsWith('.pem') ||
    normalized.endsWith('.crt') ||
    normalized.endsWith('.key');
  return isEnvFile || isCertFile;
}

const origReadFileSync = fs.readFileSync;
fs.readFileSync = function (filePath, ...args) {
  if (isSecretOrCertPath(filePath)) {
    throw new Error(`[JEST TEST ISOLATION] Blocked synchronous read of secret/certificate file: ${filePath}`);
  }
  return origReadFileSync.call(fs, filePath, ...args);
};

const origReadFile = fs.readFile;
fs.readFile = function (filePath, ...args) {
  if (isSecretOrCertPath(filePath)) {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    const err = new Error(`[JEST TEST ISOLATION] Blocked asynchronous read of secret/certificate file: ${filePath}`);
    if (cb) return cb(err);
    throw err;
  }
  return origReadFile.call(fs, filePath, ...args);
};

if (fs.promises && fs.promises.readFile) {
  const origPromisesReadFile = fs.promises.readFile;
  fs.promises.readFile = async function (filePath, ...args) {
    if (isSecretOrCertPath(filePath)) {
      throw new Error(`[JEST TEST ISOLATION] Blocked promises read of secret/certificate file: ${filePath}`);
    }
    return origPromisesReadFile.call(fs.promises, filePath, ...args);
  };
}

// Prevent test side-effects on repository log files
if (fs.promises && fs.promises.appendFile) {
  const origAppendFile = fs.promises.appendFile;
  fs.promises.appendFile = async function (filePath, data, ...rest) {
    const norm = String(filePath).replace(/\\/g, '/').toLowerCase();
    if (norm.endsWith('/logs/app.log') || norm.endsWith('/logs/app.log.1')) {
      return;
    }
    return origAppendFile.call(fs.promises, filePath, data, ...rest);
  };
}

if (fs.promises && fs.promises.rename) {
  const origRename = fs.promises.rename;
  fs.promises.rename = async function (oldPath, newPath, ...rest) {
    const norm = String(oldPath).replace(/\\/g, '/').toLowerCase();
    if (norm.endsWith('/logs/app.log') || norm.endsWith('/logs/app.log.1')) {
      return;
    }
    return origRename.call(fs.promises, oldPath, newPath, ...rest);
  };
}

// ---------------------------------------------------------------------------
// 2. Safe Dummy Test Environment Configuration
// ---------------------------------------------------------------------------
process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_NAME = 'business_market_monitor_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_SSL_ENABLED = 'false';
process.env.DB_SSL_REJECT_UNAUTHORIZED = 'true';
process.env.DB_SSL_CA_PATH = '';
process.env.JWT_ACCESS_SECRET = 'test_jwt_access_secret_for_jest_isolation_min_32_chars!';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_for_jest_isolation_min_32_chars!';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.RESEND_API_KEY = 're_test_mock_dummy_key_0000000000';
process.env.RESEND_FROM_EMAIL = 'test@example.com';
process.env.CORS_ALLOWED_ORIGIN = 'http://localhost:3000';
process.env.PRICE_INGESTION_ENABLED = 'false';
process.env.NEWS_INGESTION_ENABLED = 'false';
process.env.AI_INSIGHTS_ENABLED = 'false';
process.env.ALERT_EVALUATION_ENABLED = 'false';
process.env.INDIA_GOVT_DATA_ENABLED = 'false';
process.env.WHATSAPP_ENABLED = 'false';
process.env.NEWS_DIGEST_ENABLED = 'false';

// ---------------------------------------------------------------------------
// 3. Dotenv Defusing
// ---------------------------------------------------------------------------
try {
  const dotenv = require('dotenv');
  dotenv.config = () => ({ parsed: {} });
  dotenv.parse = () => ({});
} catch (_) {
  // dotenv not loaded yet
}

// ---------------------------------------------------------------------------
// 4. Safe Database Pool Mocking (mysql2/promise)
// Standard async methods allow jest.spyOn() to mount and cleanly unmount
// without leaking call history across tests.
// ---------------------------------------------------------------------------
try {
  const mysql = require('mysql2/promise');
  mysql.createPool = function (config) {
    return {
      _isTestIsolationMock: true,
      config,
      async execute(sql) {
        throw new Error(`[JEST TEST ISOLATION] Blocked unmocked real database execute attempt in test: ${sql}`);
      },
      async query(sql) {
        throw new Error(`[JEST TEST ISOLATION] Blocked unmocked real database query attempt in test: ${sql}`);
      },
      async getConnection() {
        throw new Error('[JEST TEST ISOLATION] Blocked unmocked real database getConnection attempt in test');
      },
      async end() {},
      on() {},
      emit() {},
    };
  };
} catch (_) {
  // mysql2 not loaded yet
}

// ---------------------------------------------------------------------------
// 5. Network Fetch Guard
// ---------------------------------------------------------------------------
if (typeof global.fetch === 'function') {
  global.fetch = function (resource) {
    throw new Error(`[JEST TEST ISOLATION] Blocked real outbound HTTP fetch call to: ${resource}`);
  };
}
