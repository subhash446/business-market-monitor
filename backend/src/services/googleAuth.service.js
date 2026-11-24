'use strict';

/**
 * googleAuth.service.js — Cryptographic verification of Google Identity Services ID Tokens.
 *
 * Implements:
 * - RS256 signature verification against Google's public JWK keys (https://www.googleapis.com/oauth2/v3/certs).
 * - In-memory key caching with TTL.
 * - Claims verification: iss, aud, exp, email_verified, sub.
 * - Test dependency-injection hook for deterministic unit testing.
 */

const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let jwksCache = {
  keys: [],
  fetchedAt: 0,
};

let customVerifierHook = null;

/**
 * Dependency injection hook for deterministic unit tests.
 * @param {Function|null} fn - (credential) => Promise<payload> | payload
 */
function setCustomVerifier(fn) {
  customVerifierHook = fn;
}

/**
 * Fetches Google's public JWKs with in-memory caching (1 hour TTL).
 */
async function fetchGoogleJwks(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && jwksCache.keys.length > 0 && now - jwksCache.fetchedAt < 3600000) {
    return jwksCache.keys;
  }

  try {
    const res = await fetch(GOOGLE_CERTS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Google certs endpoint returned HTTP ${res.status}`);
    }

    const data = await res.json();
    if (Array.isArray(data.keys) && data.keys.length > 0) {
      jwksCache = {
        keys: data.keys,
        fetchedAt: now,
      };
      return jwksCache.keys;
    }
    throw new Error('Google certs response did not contain valid keys array');
  } catch (err) {
    logger.error(`[googleAuth] Failed to fetch Google JWKs: ${err.message}`);
    // If cache has stale keys, fall back to them; otherwise rethrow
    if (jwksCache.keys.length > 0) {
      return jwksCache.keys;
    }
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Unable to verify Google credentials at this time');
  }
}

/**
 * Verifies a Google ID token cryptographically and validates required claims.
 * @param {string} credential - JWT string
 * @param {object} options
 * @returns {Promise<{ sub: string, email: string, name: string, picture?: string }>}
 */
async function verifyGoogleIdToken(credential, options = {}) {
  if (customVerifierHook) {
    return customVerifierHook(credential);
  }

  if (!credential || typeof credential !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Google credential token is required');
  }

  const parts = credential.split('.');
  if (parts.length !== 3) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Malformed Google ID token');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header;
  let payload;

  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid Google token format or encoding');
  }

  if (header.alg !== 'RS256') {
    throw new AppError(401, 'AUTHENTICATION_ERROR', `Unsupported token algorithm: ${header.alg}`);
  }

  if (!header.kid) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Token header missing kid');
  }

  // 1. Fetch JWKs and find matching key
  let keys = await fetchGoogleJwks();
  let matchedKey = keys.find((k) => k.kid === header.kid);

  // If not found in cache, force fresh fetch once
  if (!matchedKey) {
    keys = await fetchGoogleJwks(true);
    matchedKey = keys.find((k) => k.kid === header.kid);
  }

  if (!matchedKey) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Google public key not found for token kid');
  }

  // 2. Cryptographic signature check
  try {
    const publicKey = crypto.createPublicKey({ key: matchedKey, format: 'jwk' });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(signatureB64, 'base64url');

    const isValid = verifier.verify(publicKey, signature);
    if (!isValid) {
      throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid Google token signature');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Cryptographic verification failed for Google token');
  }

  // 3. Claims validation
  if (!VALID_ISSUERS.includes(payload.iss)) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', `Invalid token issuer: ${payload.iss}`);
  }

  const expectedClientId = options.clientId || env.google.clientId;
  if (expectedClientId && payload.aud !== expectedClientId) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Token audience mismatch for Google client');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < nowSeconds) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Google ID token has expired');
  }

  if (!payload.email_verified && payload.email_verified !== 'true') {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Google account email is not verified');
  }

  if (!payload.email || !payload.sub) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Google token missing required claims (email or sub)');
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email).toLowerCase().trim(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || null,
  };
}

module.exports = {
  verifyGoogleIdToken,
  setCustomVerifier,
  fetchGoogleJwks,
};
