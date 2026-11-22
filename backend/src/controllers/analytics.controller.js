'use strict';

/**
 * Analytics Controller (V3-M5).
 *
 * Exposes endpoints for procurement intelligence and savings ROI calculations.
 */

const savingsRoiService = require('../services/savingsRoi.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { sendSuccess } = require('../utils/response');

async function getSavingsRoi(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const roi = await savingsRoiService.calculateSavingsRoi(businessId);
    sendSuccess(res, roi);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSavingsRoi,
};
