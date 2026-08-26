/**
 * Email Alerts module (Document 2 §5.8, Document 5 §4.8).
 * Implemented (Phase 9): all 5 rule/event endpoints. Scheduled evaluation
 * and email delivery are explicitly out of scope (approved decisions #5-8).
 */
const alertRuleService = require('../services/alertRule.service');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { parsePagination } = require('../utils/pagination');
const { sendSuccess } = require('../utils/response');

// GET /api/v1/alerts/rules — FR-ALERT-05
async function listAlertRules(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const rules = await alertRuleService.listRules(businessId);
    sendSuccess(res, rules);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/alerts/rules — FR-ALERT-01
async function createAlertRule(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { trackedMaterialId, conditionType, thresholdPrice } = req.body;
    const rule = await alertRuleService.createRule(businessId, { trackedMaterialId, conditionType, thresholdPrice });
    sendSuccess(res, rule, undefined, 201);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/alerts/rules/:ruleId — FR-ALERT-05
async function updateAlertRule(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const rule = await alertRuleService.updateRule(businessId, req.params.ruleId, req.body);
    sendSuccess(res, rule);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/alerts/rules/:ruleId — FR-ALERT-05 (soft delete only, Document 4 §12.2)
async function deleteAlertRule(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const result = await alertRuleService.deleteRule(businessId, req.params.ruleId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/alerts/events — FR-ALERT-08
async function listAlertEvents(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const pagination = parsePagination(req.query);
    const { items, meta } = await alertRuleService.listEvents(businessId, pagination);
    sendSuccess(res, items, meta);
  } catch (err) {
    next(err);
  }
}

module.exports = { listAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, listAlertEvents };
