/**
 * Business Profile business logic (Document 2 §5.2 FR-BIZ-01–04, Document 3 §5
 * BusinessService). Framework-agnostic — no req/res, no SQL (Document 3 §3).
 */
const businessRepository = require('../repositories/business.repository');
const businessMemberRepository = require('../repositories/businessMember.repository');
const userRepository = require('../repositories/user.repository');
const materialRepository = require('../repositories/material.repository');
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
    // Record creator as active OWNER in business_members table
    try {
      const user = await userRepository.findById(userId);
      await businessMemberRepository.addActiveMember({
        businessId: business.id,
        userId,
        email: user?.email || contactEmail || `user_${userId}@bmm.internal`,
        role: 'OWNER',
      });
    } catch (_) {
      // Non-blocking in environments where migration 035 hasn't run yet
    }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'CONFLICT', 'This user already has a business');
    }
    throw err;
  }

  const { materialsGenerated } = await templateGenerationService.generateTemplate(business.id, industryId);
  const trackedList = await materialRepository.listByBusinessId(business.id);

  return {
    id: business.id,
    name: business.name,
    industryId: business.industry_id,
    industrySlug: business.industry_slug || null,
    businessRole: 'OWNER',
    materialsGenerated,
    materials: (trackedList || []).map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit_abbreviation,
      isTracked: !!m.is_tracked,
      externalSymbol: m.external_symbol,
      hasAutomatedFeed: !!m.external_symbol,
    })),
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

  const updated = await businessRepository.update(business.id, {
    name: updates.name,
    contactEmail: updates.contactEmail ?? business.contact_email,
    contactPhone: updates.contactPhone ?? business.contact_phone,
    address: updates.address ?? business.address,
    newsDigestEnabled: updates.newsDigestEnabled ?? !!business.news_digest_enabled,
    newsDigestFrequency: updates.newsDigestFrequency ?? business.news_digest_frequency,
    newsDigestChannel: updates.newsDigestChannel ?? business.news_digest_channel ?? 'EMAIL',
  });

  return toPublicBusiness(updated);
}

function toPublicBusiness(business) {
  return {
    id: business.id,
    name: business.name,
    industryId: business.industry_id,
    industryName: business.industry_name,
    industrySlug: business.industry_slug || null,
    contactEmail: business.contact_email,
    contactPhone: business.contact_phone,
    address: business.address,
    newsDigestEnabled: !!business.news_digest_enabled,
    newsDigestFrequency: business.news_digest_frequency,
    newsDigestChannel: business.news_digest_channel || 'EMAIL',
    lastDigestSentAt: business.last_digest_sent_at || null,
    businessRole: business.businessRole || business.business_role || 'OWNER',
  };
}

module.exports = { createBusiness, getBusiness, updateBusiness };
