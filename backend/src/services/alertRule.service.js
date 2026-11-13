/**
 * Email Alerts business logic (Document 2 §5.8 FR-ALERT-01, 05, 08).
 * Framework-agnostic — no req/res, no SQL (Document 3 §3).
 *
 * Phase 2 enhancements:
 *   - thresholdType ('ABSOLUTE' | 'PERCENTAGE')
 *   - cooldownHours (defaults to 24)
 *   - lastTriggeredAt
 */
const alertRuleRepository = require('../repositories/alertRule.repository');
const alertEventRepository = require('../repositories/alertEvent.repository');
const materialRepository = require('../repositories/material.repository');
const { buildMeta } = require('../utils/pagination');
const AppError = require('../utils/AppError');

async function listRules(businessId) {
  const rows = await alertRuleRepository.listActiveByBusinessId(businessId);
  return rows.map(toPublicRule);
}

const {
  isStrictFiniteNumber,
  isStrictPositiveInteger,
} = require('../utils/validationHelpers');

function assertValidRuleConfig({ thresholdPrice, thresholdType, cooldownHours }) {
  if (!isStrictFiniteNumber(thresholdPrice) || Number(thresholdPrice) <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'thresholdPrice', issue: 'must be a positive number' },
    ]);
  }
  if (thresholdType === 'PERCENTAGE' && Number(thresholdPrice) > 1000) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'thresholdPrice', issue: 'must be a positive number (up to 1000 for PERCENTAGE)' },
    ]);
  }
  if (!isStrictPositiveInteger(cooldownHours) || Number(cooldownHours) > 720) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
      { field: 'cooldownHours', issue: 'must be an integer between 1 and 720' },
    ]);
  }
}

async function createRule(businessId, {
  trackedMaterialId,
  conditionType,
  thresholdPrice,
  thresholdType = 'ABSOLUTE',
  cooldownHours = 24,
}) {
  assertValidRuleConfig({ thresholdPrice, thresholdType, cooldownHours });
  const material = await materialRepository.findByIdForBusiness(trackedMaterialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  const rule = await alertRuleRepository.create({
    businessId,
    trackedMaterialId,
    conditionType,
    thresholdPrice,
    thresholdType,
    cooldownHours,
  });
  return toPublicRule(rule);
}

async function updateRule(businessId, ruleId, updates) {
  const existing = await alertRuleRepository.findByIdForBusiness(ruleId, businessId);
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Alert rule not found');
  }

  const merged = {
    conditionType: updates.conditionType !== undefined ? updates.conditionType : existing.condition_type,
    thresholdPrice: updates.thresholdPrice !== undefined ? updates.thresholdPrice : existing.threshold_price,
    thresholdType: updates.thresholdType !== undefined ? updates.thresholdType : (existing.threshold_type || 'ABSOLUTE'),
    cooldownHours: updates.cooldownHours !== undefined ? updates.cooldownHours : (existing.cooldown_hours || 24),
    isActive: updates.isActive !== undefined ? updates.isActive : !!existing.is_active,
  };
  assertValidRuleConfig(merged);

  const updated = await alertRuleRepository.update(ruleId, merged, businessId);
  if (!updated) {
    throw new AppError(404, 'NOT_FOUND', 'Alert rule not found');
  }
  return toPublicRule(updated);
}

async function deleteRule(businessId, ruleId) {
  const existing = await alertRuleRepository.findByIdForBusiness(ruleId, businessId);
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Alert rule not found');
  }

  const deletedAt = await alertRuleRepository.softDelete(ruleId, businessId);
  if (!deletedAt) {
    throw new AppError(404, 'NOT_FOUND', 'Alert rule not found');
  }
  const formattedDeletedAt = deletedAt instanceof Date ? deletedAt.toISOString() : deletedAt;
  return { id: Number(ruleId), deletedAt: formattedDeletedAt };
}

async function listEvents(businessId, { page, limit, offset }) {
  const [rows, total] = await Promise.all([
    alertEventRepository.listByBusinessId(businessId, { limit, offset }),
    alertEventRepository.countByBusinessId(businessId),
  ]);

  return {
    items: rows.map(toPublicEvent),
    meta: buildMeta({ page, limit, total }),
  };
}

function toPublicRule(rule) {
  let lastTriggeredAt = rule.last_triggered_at;
  if (lastTriggeredAt instanceof Date) {
    lastTriggeredAt = lastTriggeredAt.toISOString();
  }
  return {
    id: rule.id,
    trackedMaterialId: rule.tracked_material_id,
    conditionType: rule.condition_type,
    thresholdPrice: rule.threshold_price,
    thresholdType: rule.threshold_type || 'ABSOLUTE',
    cooldownHours: rule.cooldown_hours !== undefined ? rule.cooldown_hours : 24,
    lastTriggeredAt: lastTriggeredAt || null,
    isActive: !!rule.is_active,
  };
}

function toPublicEvent(event) {
  let triggeredAt = event.triggered_at;
  if (triggeredAt instanceof Date) {
    triggeredAt = triggeredAt.toISOString();
  }
  return {
    id: event.id,
    alertRuleId: event.alert_rule_id,
    trackedMaterialId: event.tracked_material_id,
    triggeredPrice: event.triggered_price,
    thresholdPriceSnapshot: event.threshold_price_snapshot,
    conditionTypeSnapshot: event.condition_type_snapshot,
    thresholdTypeSnapshot: event.threshold_type_snapshot || 'ABSOLUTE',
    triggeredChangePercent: event.triggered_change_percent !== null && event.triggered_change_percent !== undefined
      ? Number(event.triggered_change_percent)
      : null,
    notificationChannel: event.notification_channel,
    deliveryStatus: event.delivery_status,
    triggeredAt,
  };
}

module.exports = { listRules, createRule, updateRule, deleteRule, listEvents };
