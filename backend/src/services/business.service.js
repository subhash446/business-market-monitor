/**
 * Business Profile business logic (Document 2 §5.2 FR-BIZ-01–04, Document 3 §5
 * BusinessService). Framework-agnostic — no req/res, no SQL (Document 3 §3).
 */
const businessRepository = require('../repositories/business.repository');
const templateGenerationService = require('./templateGeneration.service');
const AppError = require('../utils/AppError');

async function createBusiness({ userId, name, industryId, contactEmail, contactPhone, address }) {
  const existing = await businessRepository.findByUserId(userId);
  if (existing) {
    throw new AppError(409, 'CONFLICT', 'This user already has a business');
  }

  const industryValid = await businessRepository.industryExists(industryId);
  if (!industryValid) {
    throw new AppError(400, 'VALIDATION_ERROR', 'industryId does not reference a known industry');
  }

  let business;
  try {
    business = await businessRepository.create({ userId, industryId, name, contactEmail, contactPhone, address });
  } catch (err) {
    // DB-level safety net behind the application-level check above
    // (Document 4 §5.2 UNIQUE KEY uq_businesses_user_id) — closes the
    // same race-condition gap as auth.service.js's registration check.
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'CONFLICT', 'This user already has a business');
    }
    throw err;
  }

  const { materialsGenerated } = await templateGenerationService.generateTemplate(business.id, industryId);

  return {
    id: business.id,
    name: business.name,
    industryId: business.industry_id,
    materialsGenerated,
  };
}

async function getBusiness(userId) {
  const business = await businessRepository.findByUserId(userId);
  if (!business) {
    throw new AppError(404, 'NOT_FOUND', 'Business not found');
  }
  return toPublicBusiness(business);
}

async function updateBusiness(userId, updates) {
  const business = await businessRepository.findByUserId(userId);
  if (!business) {
    throw new AppError(404, 'NOT_FOUND', 'Business not found');
  }

  // industryId is deliberately not accepted here at all (Document 5 §4.2) —
  // enforced earlier at the validator layer (business.validator.js), which
  // rejects the request before it ever reaches this service.
  const updated = await businessRepository.update(business.id, {
    name: updates.name,
    contactEmail: updates.contactEmail ?? business.contact_email,
    contactPhone: updates.contactPhone ?? business.contact_phone,
    address: updates.address ?? business.address,
    newsDigestEnabled: updates.newsDigestEnabled ?? !!business.news_digest_enabled,
    newsDigestFrequency: updates.newsDigestFrequency ?? business.news_digest_frequency,
  });

  return toPublicBusiness(updated);
}

function toPublicBusiness(business) {
  return {
    id: business.id,
    name: business.name,
    industryId: business.industry_id,
    industryName: business.industry_name,
    contactEmail: business.contact_email,
    contactPhone: business.contact_phone,
    address: business.address,
    newsDigestEnabled: !!business.news_digest_enabled,
    newsDigestFrequency: business.news_digest_frequency,
  };
}

module.exports = { createBusiness, getBusiness, updateBusiness };
