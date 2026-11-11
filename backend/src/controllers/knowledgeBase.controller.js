/**
 * Industry Knowledge Base module (Document 2 §5.3, Document 5 §4.3, Phase 5 Category Mapping).
 * Read-only — no write endpoints (OI-1).
 */
const knowledgeBaseService = require('../services/knowledgeBase.service');
const { sendSuccess } = require('../utils/response');

// GET /api/v1/industries — FR-IKB-01
async function listIndustries(req, res, next) {
  try {
    const industries = await knowledgeBaseService.listIndustries();
    sendSuccess(res, industries);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/industries/:industryId — FR-IKB-01
async function getIndustry(req, res, next) {
  try {
    const industry = await knowledgeBaseService.getIndustry(req.params.industryId);
    sendSuccess(res, industry);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/industries/:industryId/materials — Phase 5 Automatic Mapping
async function getIndustryMaterials(req, res, next) {
  try {
    const materials = await knowledgeBaseService.getIndustryMaterials(req.params.industryId);
    sendSuccess(res, materials);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/industries/:industryId/knowledge-base — FR-IKB-01, 02, 05
async function getIndustryKnowledgeBase(req, res, next) {
  try {
    const knowledgeBase = await knowledgeBaseService.getIndustryKnowledgeBase(req.params.industryId);
    sendSuccess(res, knowledgeBase);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/units-of-measurement — FR-MAT-04
async function listUnitsOfMeasurement(req, res, next) {
  try {
    const units = await knowledgeBaseService.listUnitsOfMeasurement();
    sendSuccess(res, units);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listIndustries,
  getIndustry,
  getIndustryMaterials,
  getIndustryKnowledgeBase,
  listUnitsOfMeasurement,
};
