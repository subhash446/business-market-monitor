const express = require('express');
const router = express.Router();
const priceController = require('../controllers/price.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { validateAddPrice } = require('../validators/price.validator');

// Mounted at /api/v1/materials alongside materials.routes.js (Document 5 §4.6)
router.get('/:materialId/prices/latest', authMiddleware, priceController.getLatestPrice);
router.post('/:materialId/prices', authMiddleware, validate(validateAddPrice), priceController.addPrice);

module.exports = router;
