const express = require('express');
const router = express.Router();
const knowledgeBaseController = require('../controllers/knowledgeBase.controller');

// All public (Document 5 §2.3) — non-sensitive, platform-wide reference data
router.get('/industries', knowledgeBaseController.listIndustries);
router.get('/industries/:industryId', knowledgeBaseController.getIndustry);
router.get('/industries/:industryId/knowledge-base', knowledgeBaseController.getIndustryKnowledgeBase);
router.get('/units-of-measurement', knowledgeBaseController.listUnitsOfMeasurement);

module.exports = router;
