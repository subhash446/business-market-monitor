const express = require('express');
const router = express.Router();
const materialController = require('../controllers/material.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const {
  validateUpdateMaterial,
  validateCreateMaterial,
  validateSetExternalSymbol,
  validateUpdateInventoryProfile,
  validateUpdateLandedCost,
} = require('../validators/material.validator');

router.get('/', authMiddleware, materialController.listMaterials);
router.post('/', authMiddleware, validate(validateCreateMaterial), materialController.addMaterial);
router.patch('/:materialId', authMiddleware, validate(validateUpdateMaterial), materialController.updateMaterial);

// Phase B: set or clear the external commodity symbol for a tracked material.
// PATCH before /:materialId/... to avoid shadowing the general /:materialId route.
router.patch('/:materialId/external-symbol', authMiddleware, validate(validateSetExternalSymbol), materialController.setExternalSymbol);

// V3-M1: update inventory profile for a tracked material
router.patch('/:materialId/inventory', authMiddleware, validate(validateUpdateInventoryProfile), materialController.updateInventoryProfile);

// V3-M3: update landed-cost configuration for a tracked material
router.patch('/:materialId/landed-cost', authMiddleware, validate(validateUpdateLandedCost), materialController.updateLandedCost);

// T-08: Supplier recommendations for a tracked material
router.get('/:materialId/supplier-recommendations', authMiddleware, materialController.getSupplierRecommendations);

// V3-M2: Directional price outlook and bands for a tracked material
router.get('/:materialId/price-outlook', authMiddleware, materialController.getPriceOutlook);

module.exports = router;
