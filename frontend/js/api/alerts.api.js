/**
 * Alerts API module
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §3, Doc 4 §7.1 — js/api/alerts.api.js
 *
 * All endpoints mounted at /api/v1/alerts/
 *
 * ── Alert Rules ───────────────────────────────────────────────────
 *
 * GET  /alerts/rules
 *   Response: [{ id, trackedMaterialId, conditionType, thresholdPrice, isActive }]
 *
 * POST /alerts/rules
 *   Body (required): { trackedMaterialId: number, conditionType: string, thresholdPrice: number }
 *   conditionType: 'PRICE_ABOVE' | 'PRICE_BELOW'  (exact enum — backend validator enforces)
 *   thresholdPrice: number > 0
 *   Response (201): { id, trackedMaterialId, conditionType, thresholdPrice, isActive }
 *   Errors:
 *     400 VALIDATION_ERROR — missing/invalid fields
 *     404 NOT_FOUND       — trackedMaterialId not found for this business
 *     409 CONFLICT        — duplicate rule for same material+condition
 *
 * PATCH /alerts/rules/:ruleId
 *   Body: any subset of { conditionType?, thresholdPrice?, isActive: boolean }
 *   ONLY these three fields allowed — any other field → 400
 *   Response (200): updated rule object (same shape as POST response)
 *   Errors: 400 VALIDATION_ERROR, 404 NOT_FOUND
 *
 * DELETE /alerts/rules/:ruleId
 *   Response (200): { id: number, deletedAt: string }  — soft delete (never a real DELETE)
 *   Errors: 404 NOT_FOUND
 *
 * ── Alert Events ──────────────────────────────────────────────────
 *
 * GET  /alerts/events
 *   Query: { page?: number, limit?: number }
 *   Response:
 *     data: [{
 *       id, triggeredPrice, thresholdPriceSnapshot, conditionTypeSnapshot,
 *       notificationChannel, deliveryStatus, triggeredAt
 *     }]
 *     meta: { page, limit, total, totalPages }
 *   deliveryStatus values: 'PENDING' | 'SENT' | 'FAILED'
 *
 * CONFIRMED from alertRule.service.js toPublicRule / toPublicEvent:
 *   Rule:  { id, trackedMaterialId, conditionType, thresholdPrice, isActive }
 *   Event: { id, triggeredPrice, thresholdPriceSnapshot, conditionTypeSnapshot,
 *             notificationChannel, deliveryStatus, triggeredAt }
 *   NO materialId or materialName in event objects.
 *   Dashboard events subset: { id, triggeredAt } only — different endpoint.
 */

import { get, post, patch, del } from '../api/client.js';

/** Condition type enum (backend: alert.validator.js CONDITION_TYPES) */
export const CONDITION_TYPES = {
  PRICE_ABOVE: 'PRICE_ABOVE',
  PRICE_BELOW: 'PRICE_BELOW',
};

export const EVENTS_LIMIT = 20;

/* ── Alert Rules ────────────────────────────────────────────────── */

/**
 * List all alert rules for the authenticated business.
 * @returns {Promise<Array<{id,trackedMaterialId,conditionType,thresholdPrice,isActive}>>}
 */
export async function getAlertRules() {
  const { data } = await get('/alerts/rules');
  return data;
}

/**
 * Create a new alert rule.
 * POST /api/v1/alerts/rules
 * @param {{ trackedMaterialId: number, conditionType: string, thresholdPrice: number }} body
 * @returns {Promise<{id,trackedMaterialId,conditionType,thresholdPrice,isActive}>}
 * @throws 400 VALIDATION_ERROR, 404 NOT_FOUND, 409 CONFLICT
 */
export async function createAlertRule({ trackedMaterialId, conditionType, thresholdPrice }) {
  const { data } = await post('/alerts/rules', { trackedMaterialId, conditionType, thresholdPrice });
  return data;
}

/**
 * Update an alert rule.
 * PATCH /api/v1/alerts/rules/:ruleId
 * Allowed fields: conditionType, thresholdPrice, isActive — any subset.
 * @param {number|string} ruleId
 * @param {{ conditionType?: string, thresholdPrice?: number, isActive?: boolean }} updates
 * @returns {Promise<{id,trackedMaterialId,conditionType,thresholdPrice,isActive}>}
 */
export async function updateAlertRule(ruleId, updates) {
  const { data } = await patch(`/alerts/rules/${ruleId}`, updates);
  return data;
}

/**
 * Delete (soft-delete) an alert rule.
 * DELETE /api/v1/alerts/rules/:ruleId
 * @param {number|string} ruleId
 * @returns {Promise<{ id: number, deletedAt: string }>}
 */
export async function deleteAlertRule(ruleId) {
  const { data } = await del(`/alerts/rules/${ruleId}`);
  return data;
}

/* ── Alert Events ───────────────────────────────────────────────── */

/**
 * List paginated alert events for the authenticated business.
 * GET /api/v1/alerts/events
 * @param {{ page?: number, limit?: number }} opts
 * @returns {Promise<{ data: Array, meta: {page,limit,total,totalPages} }>}
 */
export async function getAlertEvents({ page = 1, limit = EVENTS_LIMIT } = {}) {
  const params = new URLSearchParams({ page, limit });
  const { data, meta } = await get(`/alerts/events?${params}`);
  return { data, meta };
}
