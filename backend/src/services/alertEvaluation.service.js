const alertRuleRepository = require('../repositories/alertRule.repository');
const alertEventRepository = require('../repositories/alertEvent.repository');
const priceRepository = require('../repositories/price.repository');
const materialRepository = require('../repositories/material.repository');
const businessRepository = require('../repositories/business.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');
const { SUPPORTED_SYMBOLS } = require('../config/commodityMapping');
const logger = require('../utils/logger');

const VALID_EXTERNAL_SYMBOLS = new Set(Object.values(SUPPORTED_SYMBOLS));

/**
 * Evaluate active alert rules for a material against its latest price.
 *
 * Rules:
 *   - Only evaluate against valid price records (is_valid !== 0).
 *   - Prevent proxy mislabelling: if price is MARKET_INDICATIVE proxy,
 *     only evaluate if material tracks that external symbol.
 *   - Enforce cooldown window (last_triggered_at + cooldown_hours > now -> skip).
 *   - Support ABSOLUTE and PERCENTAGE thresholds.
 *     * PERCENTAGE requires at least two valid price points in the same currency.
 *   - Prevent duplicate events and record delivery status.
 */
async function evaluateMaterial(businessId, trackedMaterialId) {
  // Get the latest recorded price for this material.
  const latestPrice = await priceRepository.findLatestByMaterialId(trackedMaterialId);
  if (!latestPrice) {
    return [];
  }

  // Data Integrity: Skip invalid prices.
  if (latestPrice.is_valid === 0 || latestPrice.is_valid === false) {
    logger.info(`[Alert Evaluation] Material ${trackedMaterialId}: skipping invalid price point (${latestPrice.invalid_reason || 'unspecified'})`);
    return [];
  }

  // Get only active, non-deleted rules belonging to this business.
  const rules = await alertRuleRepository.listActiveByBusinessId(businessId);
  const materialRules = rules.filter(
    (rule) => Number(rule.tracked_material_id) === Number(trackedMaterialId)
  );

  if (materialRules.length === 0) {
    return [];
  }

  // Get material for name, unit, and external symbol check.
  const material = await materialRepository.findByIdForBusiness(
    trackedMaterialId,
    businessId
  );

  // Data Integrity: Never trigger direct material alerts with incompatible or unmapped benchmarks.
  // If latest price is MARKET_INDICATIVE or OFFICIAL_BENCHMARK, require a valid supported external_symbol.
  const isExternalBenchmark =
    latestPrice.data_class === 'MARKET_INDICATIVE' ||
    latestPrice.data_class === 'OFFICIAL_BENCHMARK';
  const hasValidExternalSymbol =
    typeof material?.external_symbol === 'string' &&
    VALID_EXTERNAL_SYMBOLS.has(material.external_symbol);

  if (isExternalBenchmark && !hasValidExternalSymbol) {
    logger.info(
      `[Alert Evaluation] Material ${trackedMaterialId}: skipping ${latestPrice.data_class} benchmark price for unmapped or invalid external_symbol`
    );
    return [];
  }

  // Get business -> user -> recipient email and fallback phone.
  const business = await businessRepository.findById(businessId);
  let user = null;
  if (business?.user_id) {
    user = await userRepository.findById(business.user_id);
  }

  const recipientEmail = user?.email || business?.contact_email || null;
  const businessPhone = business?.contact_phone || null;

  const materialName = material?.name || 'Tracked Material';
  const triggeredEvents = [];

  for (const rule of materialRules) {
    // 1. Cooldown Check (null, undefined, or invalid values safely default to 24h, matching SQL COALESCE)
    if (rule.last_triggered_at) {
      const lastTriggered = new Date(rule.last_triggered_at).getTime();
      const rawCooldown = rule.cooldown_hours;
      const parsedCooldown = Number(rawCooldown);
      const cooldownHours =
        rawCooldown !== null &&
        rawCooldown !== undefined &&
        rawCooldown !== '' &&
        typeof rawCooldown !== 'boolean' &&
        Number.isFinite(parsedCooldown) &&
        parsedCooldown >= 1
          ? parsedCooldown
          : 24;
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      if (!Number.isNaN(lastTriggered) && Date.now() - lastTriggered < cooldownMs) {
        continue; // In cooldown window — skip
      }
    }

    const currentPrice = Number(latestPrice.price);
    const thresholdVal = Number(rule.threshold_price);
    const thresholdType = rule.threshold_type || 'ABSOLUTE';

    let triggered = false;
    let percentChange = null;

    // 2. Threshold Evaluation
    if (thresholdType === 'PERCENTAGE') {
      // Find previous valid price point with matching currency
      const prevPriceRecord = await priceRepository.findPreviousValidPrice(
        trackedMaterialId,
        latestPrice.recorded_at,
        latestPrice.id,
        latestPrice.currency
      );

      if (!prevPriceRecord) {
        // Percentage alert requires at least two valid price observations
        continue;
      }

      const prev = Number(prevPriceRecord.price);
      if (prev <= 0) continue;

      percentChange = ((currentPrice - prev) / prev) * 100;

      if (rule.condition_type === 'PRICE_ABOVE') {
        triggered = percentChange >= thresholdVal;
      } else if (rule.condition_type === 'PRICE_BELOW') {
        triggered = percentChange <= -thresholdVal;
      }
    } else {
      // ABSOLUTE threshold
      if (rule.condition_type === 'PRICE_ABOVE') {
        triggered = currentPrice > thresholdVal;
      } else if (rule.condition_type === 'PRICE_BELOW') {
        triggered = currentPrice < thresholdVal;
      }
    }

    if (!triggered) {
      continue;
    }

    // 3. Atomically claim trigger cooldown before creating event or dispatching notification
    const claimed = await alertRuleRepository.claimTriggerCooldown(rule.id, new Date(), businessId);
    if (!claimed) {
      continue;
    }

    // 4. Determine channels to dispatch: EMAIL, WHATSAPP, or BOTH
    const ruleChannel = rule.notification_channel || 'EMAIL';
    const channels = ruleChannel === 'BOTH'
      ? ['EMAIL', 'WHATSAPP']
      : ruleChannel === 'WHATSAPP'
        ? ['WHATSAPP']
        : ['EMAIL'];

    const targetPhone = rule.destination_phone || businessPhone;

    // 5. Dispatch per channel independently
    for (const channel of channels) {
      if (channel === 'EMAIL') {
        const emailEvent = await alertEventRepository.create({
          alertRuleId: rule.id,
          businessId,
          trackedMaterialId: rule.tracked_material_id,
          triggeredPrice: currentPrice,
          thresholdPriceSnapshot: thresholdVal,
          conditionTypeSnapshot: rule.condition_type,
          thresholdTypeSnapshot: thresholdType,
          triggeredChangePercent: percentChange,
          notificationChannel: 'EMAIL',
          recipientPhoneSnapshot: null,
          deliveryStatus: 'PENDING',
        });

        if (!emailEvent) continue;

        if (!recipientEmail) {
          await alertEventRepository.updateDeliveryStatus(emailEvent.id, 'FAILED');
          logger.warn(`[Alert Email] No recipient email found for business ${businessId}, event ${emailEvent.id} failed`);
          triggeredEvents.push({ ...emailEvent, delivery_status: 'FAILED' });
          continue;
        }

        try {
          await notificationService.sendAlertNotification({
            channel: 'EMAIL',
            to: recipientEmail,
            materialName,
            conditionType: rule.condition_type,
            thresholdType,
            thresholdPrice: thresholdVal,
            triggeredPrice: currentPrice,
            triggeredChangePercent: percentChange,
            currency: latestPrice.currency || 'INR',
            unitLabel: latestPrice.unit_label || material?.unit_abbreviation || material?.unit || 'unit',
            triggeredAt: emailEvent.triggered_at,
          });

          await alertEventRepository.updateDeliveryStatus(emailEvent.id, 'SENT');
          triggeredEvents.push({
            ...emailEvent,
            delivery_status: 'SENT',
          });
        } catch (error) {
          await alertEventRepository.updateDeliveryStatus(emailEvent.id, 'FAILED');
          logger.error(`[Alert Email] Failed to send alert event ${emailEvent.id}:`, error.message);
          triggeredEvents.push({
            ...emailEvent,
            delivery_status: 'FAILED',
          });
        }
      } else if (channel === 'WHATSAPP') {
        const waEvent = await alertEventRepository.create({
          alertRuleId: rule.id,
          businessId,
          trackedMaterialId: rule.tracked_material_id,
          triggeredPrice: currentPrice,
          thresholdPriceSnapshot: thresholdVal,
          conditionTypeSnapshot: rule.condition_type,
          thresholdTypeSnapshot: thresholdType,
          triggeredChangePercent: percentChange,
          notificationChannel: 'WHATSAPP',
          recipientPhoneSnapshot: targetPhone,
          deliveryStatus: 'PENDING',
        });

        if (!waEvent) continue;

        if (!targetPhone) {
          await alertEventRepository.updateDeliveryStatus(waEvent.id, 'FAILED');
          logger.warn(`[Alert WhatsApp] No destination phone found for rule ${rule.id}, event ${waEvent.id} failed`);
          triggeredEvents.push({ ...waEvent, delivery_status: 'FAILED' });
          continue;
        }

        try {
          const result = await notificationService.sendAlertNotification({
            channel: 'WHATSAPP',
            to: targetPhone,
            materialName,
            conditionType: rule.condition_type,
            thresholdType,
            thresholdPrice: thresholdVal,
            triggeredPrice: currentPrice,
            triggeredChangePercent: percentChange,
            currency: latestPrice.currency || 'INR',
            unitLabel: latestPrice.unit_label || material?.unit_abbreviation || material?.unit || 'unit',
            triggeredAt: waEvent.triggered_at,
          });

          if (result && result.success) {
            await alertEventRepository.updateDeliveryStatus(waEvent.id, 'SENT');
            triggeredEvents.push({
              ...waEvent,
              delivery_status: 'SENT',
            });
          } else {
            await alertEventRepository.updateDeliveryStatus(waEvent.id, 'FAILED');
            logger.warn(`[Alert WhatsApp] WhatsApp dispatch failed for event ${waEvent.id}: ${result?.error || 'Unknown error'}`);
            triggeredEvents.push({
              ...waEvent,
              delivery_status: 'FAILED',
            });
          }
        } catch (error) {
          await alertEventRepository.updateDeliveryStatus(waEvent.id, 'FAILED');
          logger.error(`[Alert WhatsApp] Failed to send alert event ${waEvent.id}:`, error.message);
          triggeredEvents.push({
            ...waEvent,
            delivery_status: 'FAILED',
          });
        }
      }
    }
  }

  return triggeredEvents;
}

/**
 * Evaluate all active alert rules across all businesses.
 * Used by the background scheduled alert evaluation cron job.
 */
async function evaluateAllActive() {
  const activeRules = await alertRuleRepository.listAllActive();
  if (!activeRules || activeRules.length === 0) {
    return { evaluatedCount: 0, triggeredCount: 0, events: [] };
  }

  // Deduplicate (businessId, trackedMaterialId) pairs
  const pairs = new Map();
  for (const r of activeRules) {
    const key = `${r.business_id}:${r.tracked_material_id}`;
    if (!pairs.has(key)) {
      pairs.set(key, { businessId: r.business_id, trackedMaterialId: r.tracked_material_id });
    }
  }

  const allEvents = [];
  for (const { businessId, trackedMaterialId } of pairs.values()) {
    try {
      const events = await evaluateMaterial(businessId, trackedMaterialId);
      allEvents.push(...events);
    } catch (err) {
      logger.error(`[Alert Evaluation] Error evaluating material ${trackedMaterialId} for business ${businessId}:`, err.message);
    }
  }

  return {
    evaluatedCount: activeRules.length,
    triggeredCount: allEvents.length,
    events: allEvents,
  };
}

module.exports = {
  evaluateMaterial,
  evaluateAllActive,
};
