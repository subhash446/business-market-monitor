const alertRuleRepository = require('../repositories/alertRule.repository');
const alertEventRepository = require('../repositories/alertEvent.repository');
const priceRepository = require('../repositories/price.repository');
const materialRepository = require('../repositories/material.repository');
const businessRepository = require('../repositories/business.repository');
const userRepository = require('../repositories/user.repository');
const notificationService = require('./notification.service');

/**
 * Evaluate active alert rules for a material against its latest price.
 *
 * current price
 *      ↓
 * active rules
 *      ↓
 * condition check
 *      ↓
 * matching rule
 *      ↓
 * alert_events
 *      ↓
 * email notification
 */
async function evaluateMaterial(businessId, trackedMaterialId) {
  // Get the latest recorded price for this material.
  const latestPrice = await priceRepository.findLatestByMaterialId(
    trackedMaterialId
  );

  if (!latestPrice) {
    return [];
  }

  // Get only active, non-deleted rules belonging to this business.
  const rules = await alertRuleRepository.listActiveByBusinessId(businessId);

  // Only evaluate rules for this material.
  const materialRules = rules.filter(
    (rule) =>
      Number(rule.tracked_material_id) === Number(trackedMaterialId)
  );

  if (materialRules.length === 0) {
    return [];
  }

  // Get material name for the email.
  const material = await materialRepository.findByIdForBusiness(
    trackedMaterialId,
    businessId
  );

  // Get business → user → email.
  const business = await businessRepository.findById(businessId);

  let user = null;

  if (business?.user_id) {
    user = await userRepository.findById(business.user_id);
  }

  const recipientEmail = user?.email || business?.contact_email;

  if (!recipientEmail) {
    throw new Error('No email address found for alert notification');
  }

  const materialName = material?.name || 'Tracked Material';

  const triggeredEvents = [];

  for (const rule of materialRules) {
    const currentPrice = Number(latestPrice.price);
    const thresholdPrice = Number(rule.threshold_price);

    let triggered = false;

    if (rule.condition_type === 'PRICE_ABOVE') {
      triggered = currentPrice > thresholdPrice;
    }

    if (rule.condition_type === 'PRICE_BELOW') {
      triggered = currentPrice < thresholdPrice;
    }

    if (!triggered) {
      continue;
    }

    // First create the immutable alert event.
    const event = await alertEventRepository.create({
      alertRuleId: rule.id,
      businessId,
      trackedMaterialId: rule.tracked_material_id,
      triggeredPrice: currentPrice,
      thresholdPriceSnapshot: thresholdPrice,
      conditionTypeSnapshot: rule.condition_type,
      notificationChannel: 'EMAIL',
      deliveryStatus: 'PENDING',
    });

    if (!event) {
      continue;
    }

    try {
      // Send the email.
      await notificationService.sendAlertNotification({
        to: recipientEmail,
        materialName,
        conditionType: rule.condition_type,
        thresholdPrice,
        triggeredPrice: currentPrice,
        triggeredAt: event.triggered_at,
      });

      // Mark delivery successful.
      await alertEventRepository.updateDeliveryStatus(
        event.id,
        'SENT'
      );

      triggeredEvents.push({
        ...event,
        delivery_status: 'SENT',
      });
    } catch (error) {
      // Email failed — keep the event in history and mark it failed.
      await alertEventRepository.updateDeliveryStatus(
        event.id,
        'FAILED'
      );

      console.error(
        `[Alert Email] Failed to send alert event ${event.id}:`,
        error
      );

      triggeredEvents.push({
        ...event,
        delivery_status: 'FAILED',
      });
    }
  }

  return triggeredEvents;
}

module.exports = {
  evaluateMaterial,
};