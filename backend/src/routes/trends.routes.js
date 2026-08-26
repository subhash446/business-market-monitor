const express = require('express');
const router = express.Router();
const trendController = require('../controllers/trend.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { validatePriceHistoryQuery, validateCompareQuery } = require('../validators/price.validator');

// Mounted at /api/v1/materials alongside materials.routes.js (Document 5 §4.10)
// 'query' source (Production Hardening Phase B, finding A3): both these
// validators check req.query, not req.body — validate.middleware.js now
// supports this directly, replacing the local validateQuery duplicate that
// used to live in this file.
router.get('/:materialId/prices/history', authMiddleware, validate(validatePriceHistoryQuery, 'query'), trendController.getPriceHistory);
router.get('/prices/compare', authMiddleware, validate(validateCompareQuery, 'query'), trendController.comparePrices);

module.exports = router;
