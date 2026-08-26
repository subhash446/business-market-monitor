/**
 * Email Alerts business logic (Document 2 §5.8 FR-ALERT-01, 05, 08).
 * Framework-agnostic — no req/res, no SQL (Document 3 §3).
 *
 * New file, not named in Document 3 §5 / Document 6 (which only list
 * AlertEvaluationService and NotificationService — both scheduled-job/
 * delivery side, out of scope here). Added per the approved Phase 9 scope
 * review to keep Controller → Service → Repository intact for rule CRUD
 * and event reads — same gap-fill pattern as Phase 8's newsQuery.service.js.
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

async function createRule(businessId, { trackedMaterialId, conditionType, thresholdPrice }) {
  // Reuses the existing, frozen Phase 6A ownership check — no duplicated
  // business-isolation logic (Document 5 §2.4).
  const material = await materialRepository.findByIdForBusiness(trackedMaterialId, businessId);
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Material not found');
  }

  const rule = await alertRuleRepository.create({ businessId, trackedMaterialId, conditionType, thresholdPrice });
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
    isActive: updates.isActive !== undefined ? updates.isActive : !!existing.is_active,
  };

  const updated = await alertRuleRepository.update(ruleId, merged);
  return toPublicRule(updated);
}

async function deleteRule(businessId, ruleId) {
  const existing = await alertRuleRepository.findByIdForBusiness(ruleId, businessId);
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Alert rule not found');
  }

  // Soft delete only — never a real DELETE statement (Document 4 §12.2).
  const deletedAt = await alertRuleRepository.softDelete(ruleId);
  return { id: Number(ruleId), deletedAt };
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
  return {
    id: rule.id,
    trackedMaterialId: rule.tracked_material_id,
    conditionType: rule.condition_type,
    thresholdPrice: rule.threshold_price,
    isActive: !!rule.is_active,
  };
}

function toPublicEvent(event) {
  return {
    id: event.id,
    triggeredPrice: event.triggered_price,
    thresholdPriceSnapshot: event.threshold_price_snapshot,
    conditionTypeSnapshot: event.condition_type_snapshot,
    notificationChannel: event.notification_channel,
    deliveryStatus: event.delivery_status,
    triggeredAt: event.triggered_at,
  };
}

module.exports = { listRules, createRule, updateRule, deleteRule, listEvents };
