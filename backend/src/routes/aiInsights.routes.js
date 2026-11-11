const express = require('express');
const router  = express.Router();
const aiInsightController = require('../controllers/aiInsight.controller');
const authMiddleware      = require('../middleware/auth.middleware');

// GET /api/v1/ai-insights/business/latest?limit=N
// Top-N most-recent insights across all of the business's tracked materials.
// Used by the dashboard panel.
router.get('/business/latest', authMiddleware, aiInsightController.listLatestForBusiness);

// GET /api/v1/ai-insights/:insightId/evidence
// Returns full supporting evidence (prices & news) with strict tenant isolation.
router.get('/:insightId/evidence', authMiddleware, aiInsightController.getEvidence);

module.exports = router;
