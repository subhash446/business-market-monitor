'use strict';

/**
 * Periodic News & Sourcing Digest Service (FR-ALERT-06 / T-08).
 *
 * Responsibilities:
 *   - Compiles a cohesive market intelligence snapshot for a business:
 *       • 7-day price movers across tracked materials
 *       • Sourcing & inventory buffer recommendations (aligned with V2-01C enums)
 *       • Top curated industry news items
 *   - Calculates cadence eligibility:
 *       • DAILY (>= 20 hours)
 *       • WEEKLY (>= 6 days)
 *       • MONTHLY (>= 27 days)
 *   - Dispatches formatted digest via email (Resend) and/or WhatsApp (Meta Cloud API).
 *   - Updates businesses.last_digest_sent_at upon successful delivery.
 *   - Provides preview functionality for in-app modals.
 */

const { pool } = require('../database/connection');
const businessRepository = require('../repositories/business.repository');
const materialRepository = require('../repositories/material.repository');
const newsRepository = require('../repositories/news.repository');
const supplierRecommendationService = require('./supplierRecommendation.service');
const notificationService = require('./notification.service');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Cadence intervals in milliseconds
const CADENCE_INTERVALS_MS = {
  DAILY: 20 * 60 * 60 * 1000,          // 20 hours
  WEEKLY: 6 * 24 * 60 * 60 * 1000,     // 6 days
  MONTHLY: 27 * 24 * 60 * 60 * 1000,   // 27 days
};

/**
 * Determine if a business is currently due to receive a periodic digest.
 *
 * @param {object} business
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
function isBusinessDueForDigest(business, now = new Date()) {
  if (!business || !business.news_digest_enabled) {
    return false;
  }

  if (!business.last_digest_sent_at) {
    return true; // Never sent before
  }

  const lastSent = new Date(business.last_digest_sent_at);
  if (Number.isNaN(lastSent.getTime())) {
    return true;
  }

  const freq = (business.news_digest_frequency || 'WEEKLY').toUpperCase();
  const thresholdMs = CADENCE_INTERVALS_MS[freq] || CADENCE_INTERVALS_MS.WEEKLY;
  const elapsedMs = now.getTime() - lastSent.getTime();

  return elapsedMs >= thresholdMs;
}

/**
 * Calculate 7-day price movement for a tracked material.
 */
async function get7DayPriceMovement(trackedMaterialId) {
  const [rows] = await pool.execute(
    `SELECT price, recorded_at, currency, unit_label
     FROM price_points
     WHERE tracked_material_id = ? AND is_valid = TRUE
     ORDER BY recorded_at DESC, id DESC
     LIMIT 20`,
    [trackedMaterialId]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const latest = rows[0];
  const latestPrice = Number(latest.price);
  const latestDate = new Date(latest.recorded_at).getTime();

  // Find price closest to 7 days prior (between 5 and 10 days ago), or oldest in series
  const sevenDaysAgoMs = latestDate - (7 * 24 * 60 * 60 * 1000);
  let reference = rows[rows.length - 1]; // default to oldest available

  for (let i = 1; i < rows.length; i++) {
    const rowDate = new Date(rows[i].recorded_at).getTime();
    if (rowDate <= sevenDaysAgoMs) {
      reference = rows[i];
      break;
    }
  }

  const referencePrice = Number(reference.price);
  let changePercent = 0;
  let trend = 'STABLE';

  if (referencePrice > 0 && latestPrice !== referencePrice) {
    changePercent = Number((((latestPrice - referencePrice) / referencePrice) * 100).toFixed(2));
  }

  if (changePercent >= 1.5) {
    trend = 'UP';
  } else if (changePercent <= -1.5) {
    trend = 'DOWN';
  }

  return {
    latestPrice,
    referencePrice,
    changePercent,
    trend,
    currency: latest.currency || 'INR',
    unit: latest.unit_label || null,
    latestRecordedAt: latest.recorded_at,
  };
}

/**
 * Generate a complete, structured digest payload for a business.
 *
 * @param {number} businessId
 * @returns {Promise<object>}
 */
async function generateDigestForBusiness(businessId) {
  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new AppError(404, 'NOT_FOUND', 'Business not found');
  }

  const trackedMaterials = await materialRepository.listByBusinessId(businessId, true);

  // 1. 7-Day Price Movers
  const movers = [];
  if (trackedMaterials && trackedMaterials.length > 0) {
    for (const material of trackedMaterials) {
      try {
        const movement = await get7DayPriceMovement(material.id);
        if (movement) {
          movers.push({
            materialId: material.id,
            materialName: material.name,
            unit: material.unit_abbreviation,
            ...movement,
          });
        }
      } catch (err) {
        logger.warn(`[news-digest] Could not calculate 7D movement for material ${material.id}:`, err.message);
      }
    }
  }

  // Sort movers by absolute percentage change descending
  movers.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  // 2. Curated Industry News (top 5)
  let topNews = [];
  if (business.industry_id) {
    try {
      const newsRows = await newsRepository.listByIndustry(business.industry_id, { limit: 5, offset: 0 });
      topNews = (newsRows || []).map((n) => ({
        id: n.id,
        title: n.title,
        url: n.url,
        sourceName: n.source_name,
        publishedAt: n.published_at,
        summary: n.summary,
      }));
    } catch (err) {
      logger.warn(`[news-digest] Could not load industry news for industry ${business.industry_id}:`, err.message);
    }
  }

  // 3. Sourcing & Buffer Recommendations
  let supplierRecsData = { summary: {}, recommendations: [] };
  try {
    supplierRecsData = await supplierRecommendationService.getBusinessSupplierRecommendations(businessId);
  } catch (err) {
    logger.warn(`[news-digest] Could not generate supplier recommendations for business ${businessId}:`, err.message);
  }

  const generatedAt = new Date().toISOString();

  return {
    businessId: business.id,
    businessName: business.name,
    industryId: business.industry_id,
    industryName: business.industry_name,
    contactEmail: business.contact_email,
    contactPhone: business.contact_phone,
    digestChannel: business.news_digest_channel || 'EMAIL',
    frequency: business.news_digest_frequency || 'WEEKLY',
    lastDigestSentAt: business.last_digest_sent_at || null,
    generatedAt,
    summary: {
      totalTrackedMaterials: (trackedMaterials || []).length,
      priceMoversCount: movers.length,
      topNewsCount: topNews.length,
      procurementActionsCount: (supplierRecsData.recommendations || []).length,
      actionCounts: supplierRecsData.summary,
    },
    topMovers: movers,
    topNews,
    procurementActions: supplierRecsData.recommendations || [],
  };
}

/**
 * Dispatch digest to a business across configured/overridden notification channels.
 *
 * @param {number} businessId
 * @param {object} [options]
 * @param {string} [options.channelOverride]
 * @returns {Promise<object>}
 */
async function sendDigestForBusiness(businessId, { channelOverride } = {}) {
  const digest = await generateDigestForBusiness(businessId);
  const business = await businessRepository.findById(businessId);

  // Determine recipient contact info
  let recipientEmail = business.contact_email;
  if (!recipientEmail) {
    const [userRows] = await pool.execute('SELECT email FROM users WHERE id = ? LIMIT 1', [business.user_id]);
    recipientEmail = userRows[0]?.email || null;
  }
  const recipientPhone = business.contact_phone || null;

  const activeChannel = channelOverride || business.news_digest_channel || 'EMAIL';

  const dispatchResult = await notificationService.sendNewsDigestNotification({
    channel: activeChannel,
    toEmail: recipientEmail,
    toPhone: recipientPhone,
    businessName: digest.businessName,
    industryName: digest.industryName,
    frequency: digest.frequency,
    topMovers: digest.topMovers,
    topNews: digest.topNews,
    procurementActions: digest.procurementActions,
    generatedAt: digest.generatedAt,
  });

  const now = new Date();
  if (dispatchResult.success) {
    await businessRepository.updateLastDigestSentAt(businessId, now);
  }

  return {
    success: dispatchResult.success,
    sentAt: now.toISOString(),
    channelUsed: activeChannel,
    recipientEmail: recipientEmail ? recipientEmail.replace(/(?<=.{2}).(?=[^@]*?@)/g, '*') : null,
    recipientPhone: recipientPhone ? `${recipientPhone.slice(0, 3)}****${recipientPhone.slice(-4)}` : null,
    dispatchDetails: dispatchResult.results,
    digest,
  };
}

/**
 * Batch processor: finds all businesses due for their periodic digest and dispatches them.
 *
 * @returns {Promise<object>}
 */
async function processAllDueDigests() {
  const allEnabled = await businessRepository.listBusinessesDueForDigest();
  const now = new Date();
  const dueBusinesses = (allEnabled || []).filter((b) => isBusinessDueForDigest(b, now));

  const results = {
    totalEvaluated: (allEnabled || []).length,
    dueCount: dueBusinesses.length,
    successCount: 0,
    failedCount: 0,
    skippedCount: (allEnabled || []).length - dueBusinesses.length,
    errors: [],
  };

  for (const b of dueBusinesses) {
    try {
      const outcome = await sendDigestForBusiness(b.id);
      if (outcome.success) {
        results.successCount += 1;
      } else {
        results.failedCount += 1;
        results.errors.push({ businessId: b.id, error: 'Dispatch reported partial/failed status' });
      }
    } catch (err) {
      results.failedCount += 1;
      results.errors.push({ businessId: b.id, error: err.message });
      logger.error(`[news-digest] Failed to send digest for business ${b.id}:`, err.message);
    }
  }

  return results;
}

module.exports = {
  CADENCE_INTERVALS_MS,
  isBusinessDueForDigest,
  get7DayPriceMovement,
  generateDigestForBusiness,
  sendDigestForBusiness,
  processAllDueDigests,
};
