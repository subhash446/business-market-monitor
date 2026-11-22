'use strict';

/**
 * FX Controller (V3 Milestone 3 / Migration 033).
 */

const { sendSuccess } = require('../utils/response');
const fxRateService = require('../services/fxRate.service');

// GET /api/v1/fx/latest?base=USD&quote=INR
async function getLatestFxRate(req, res, next) {
  try {
    const base = req.query.base || 'USD';
    const quote = req.query.quote || 'INR';

    const rate = await fxRateService.getLatestRate(base, quote);
    sendSuccess(res, rate);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getLatestFxRate,
};
