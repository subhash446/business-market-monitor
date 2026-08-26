/**
 * Business Profile module (Document 2 §5.2, Document 5 §4.2).
 * All three endpoints implemented (Phase 3).
 */
const businessService = require('../services/business.service');
const { sendSuccess } = require('../utils/response');

// POST /api/v1/business — FR-BIZ-01, 02, 04
async function createBusiness(req, res, next) {
  try {
    const { userId } = req.auth;
    const { name, industryId, contactEmail, contactPhone, address } = req.body;
    const business = await businessService.createBusiness({
      userId,
      name,
      industryId,
      contactEmail,
      contactPhone,
      address,
    });
    sendSuccess(res, business, undefined, 201);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/business — FR-BIZ-01
async function getBusiness(req, res, next) {
  try {
    const { userId } = req.auth;
    const business = await businessService.getBusiness(userId);
    sendSuccess(res, business);
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/business — FR-BIZ-03
async function updateBusiness(req, res, next) {
  try {
    const { userId } = req.auth;
    const { name, contactEmail, contactPhone, address, newsDigestEnabled, newsDigestFrequency } = req.body;
    const business = await businessService.updateBusiness(userId, {
      name,
      contactEmail,
      contactPhone,
      address,
      newsDigestEnabled,
      newsDigestFrequency,
    });
    sendSuccess(res, business);
  } catch (err) {
    next(err);
  }
}

module.exports = { createBusiness, getBusiness, updateBusiness };
