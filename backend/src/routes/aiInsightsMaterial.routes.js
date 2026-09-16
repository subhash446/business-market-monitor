const express = require('express');
const router  = express.Router();
const aiInsightController = require('../controllers/aiInsight.controller');
const authMiddleware      = require('../middleware/auth.middleware');

// GET /api/v1/materials/:materialId/ai-insights/latest
// Most-recent insight for one tracked material (null if none generated yet)
router.get(
  '/:materialId/ai-insights/latest',
  authMiddleware,
  aiInsightController.getLatest
);

// GET /api/v1/materials/:materialId/ai-insights
// Paginated insight history for one tracked material
router.get(
  '/:materialId/ai-insights',
  authMiddleware,
  aiInsightController.listHistory
);

module.exports = router;
