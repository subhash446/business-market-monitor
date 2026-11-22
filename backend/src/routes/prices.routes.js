const express = require('express');
const router = express.Router();
const priceController = require('../controllers/price.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { attachBusinessRole, requireRole } = require('../middleware/rbac.middleware');
const validate = require('../middleware/validate.middleware');
const { validateAddPrice, validateBulkPriceUpload } = require('../validators/price.validator');

// Mounted at /api/v1/materials alongside materials.routes.js (Document 5 §4.6)
router.get('/:materialId/prices/latest', authMiddleware, priceController.getLatestPrice);
router.get('/:materialId/prices/source-info', authMiddleware, priceController.getPriceSourceInfo);

// Bulk upload prices (V2 T-07) — placed BEFORE /:materialId/prices to ensure exact static match
router.post(
  '/prices/bulk',
  authMiddleware,
  attachBusinessRole,
  requireRole('OWNER', 'PURCHASE_MANAGER'),
  validate(validateBulkPriceUpload),
  priceController.bulkUploadPrices
);

router.post(
  '/:materialId/prices',
  authMiddleware,
  attachBusinessRole,
  requireRole('OWNER', 'PURCHASE_MANAGER'),
  validate(validateAddPrice),
  priceController.addPrice
);

module.exports = router;
