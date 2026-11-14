/**
 * Business Profile module (Document 2 §5.2, Document 5 §4.2).
 * Extended with Periodic News Digest & Supplier Recommendations (FR-ALERT-06 / T-08).
 */
const businessService = require('../services/business.service');
const newsDigestService = require('../services/newsDigest.service');
const supplierRecommendationService = require('../services/supplierRecommendation.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
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
    const { name, contactEmail, contactPhone, address, newsDigestEnabled, newsDigestFrequency, newsDigestChannel } = req.body;
    const business = await businessService.updateBusiness(userId, {
      name,
      contactEmail,
      contactPhone,
      address,
      newsDigestEnabled,
      newsDigestFrequency,
      newsDigestChannel,
    });
    sendSuccess(res, business);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/business/news-digest/preview — T-08
async function previewDigest(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const digest = await newsDigestService.generateDigestForBusiness(businessId);
    sendSuccess(res, digest);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/business/news-digest/send-now — T-08
async function sendDigestNow(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { channelOverride } = req.body || {};
    const result = await newsDigestService.sendDigestForBusiness(businessId, { channelOverride });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/business/supplier-recommendations — T-08
async function getSupplierRecommendations(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const recs = await supplierRecommendationService.getBusinessSupplierRecommendations(businessId);
    sendSuccess(res, recs);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createBusiness,
  getBusiness,
  updateBusiness,
  previewDigest,
  sendDigestNow,
  getSupplierRecommendations,
};
