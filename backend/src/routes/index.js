const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/business', require('./business.routes'));
router.use('/', require('./knowledgeBase.routes'));       // /industries, /units-of-measurement
router.use('/materials', require('./materials.routes'));  // /, /:materialId
router.use('/materials', require('./prices.routes'));     // /:materialId/prices/latest, /:materialId/prices
router.use('/materials', require('./trends.routes'));     // /:materialId/prices/history, /prices/compare
router.use('/materials', require('./aiInsightsMaterial.routes')); // /:materialId/ai-insights, /latest
router.use('/news', require('./news.routes'));
router.use('/alerts', require('./alerts.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/ai-insights', require('./aiInsights.routes')); // /business/latest
router.use('/health', require('./health.routes'));

module.exports = router;
