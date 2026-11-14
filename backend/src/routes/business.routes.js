const express = require('express');
const router = express.Router();
const businessController = require('../controllers/business.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { validateCreateBusiness, validateUpdateBusiness } = require('../validators/business.validator');

// Specific routes before generic root routes
router.get('/news-digest/preview', authMiddleware, businessController.previewDigest);
router.post('/news-digest/send-now', authMiddleware, businessController.sendDigestNow);
router.get('/supplier-recommendations', authMiddleware, businessController.getSupplierRecommendations);

router.post('/', authMiddleware, validate(validateCreateBusiness), businessController.createBusiness);
router.get('/', authMiddleware, businessController.getBusiness);
router.put('/', authMiddleware, validate(validateUpdateBusiness), businessController.updateBusiness);

module.exports = router;
