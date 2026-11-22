'use strict';

/**
 * FX Rate Repository (V3 Milestone 3 / Migration 033).
 * Manages daily exchange rate records in `fx_rates`.
 */

const { pool } = require('../database/connection');

async function upsertFxRate({ baseCurrency, quoteCurrency, rate, rateDate, source, fetchedAt }) {
  const normBase = String(baseCurrency).trim().toUpperCase();
  const normQuote = String(quoteCurrency).trim().toUpperCase();
  const effectiveFetchedAt = fetchedAt || new Date();

  const [result] = await pool.execute(
    `INSERT INTO fx_rates
       (base_currency, quote_currency, rate, rate_date, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rate = VALUES(rate),
       source = VALUES(source),
       fetched_at = VALUES(fetched_at),
       updated_at = CURRENT_TIMESTAMP`,
    [normBase, normQuote, rate, rateDate, source || 'FRANKFURTER_ECB', effectiveFetchedAt]
  );

  return result;
}

async function getLatestRate(baseCurrency = 'USD', quoteCurrency = 'INR') {
  const normBase = String(baseCurrency).trim().toUpperCase();
  const normQuote = String(quoteCurrency).trim().toUpperCase();

  const [rows] = await pool.execute(
    `SELECT id, base_currency, quote_currency, rate, rate_date, source, fetched_at, created_at, updated_at
     FROM fx_rates
     WHERE base_currency = ? AND quote_currency = ?
     ORDER BY rate_date DESC, id DESC
     LIMIT 1`,
    [normBase, normQuote]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const rateDateStr = row.rate_date instanceof Date
    ? row.rate_date.toISOString().slice(0, 10)
    : String(row.rate_date).slice(0, 10);

  return {
    id: row.id,
    baseCurrency: row.base_currency,
    quoteCurrency: row.quote_currency,
    rate: Number(row.rate),
    rateDate: rateDateStr,
    source: row.source,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getRateForDate(baseCurrency, quoteCurrency, rateDate) {
  const normBase = String(baseCurrency).trim().toUpperCase();
  const normQuote = String(quoteCurrency).trim().toUpperCase();

  const [rows] = await pool.execute(
    `SELECT id, base_currency, quote_currency, rate, rate_date, source, fetched_at, created_at, updated_at
     FROM fx_rates
     WHERE base_currency = ? AND quote_currency = ? AND rate_date = ?
     LIMIT 1`,
    [normBase, normQuote, rateDate]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const rateDateStr = row.rate_date instanceof Date
    ? row.rate_date.toISOString().slice(0, 10)
    : String(row.rate_date).slice(0, 10);

  return {
    id: row.id,
    baseCurrency: row.base_currency,
    quoteCurrency: row.quote_currency,
    rate: Number(row.rate),
    rateDate: rateDateStr,
    source: row.source,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  upsertFxRate,
  getLatestRate,
  getRateForDate,
};
