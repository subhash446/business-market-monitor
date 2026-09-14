const express = require('express');
const router = express.Router();
const materialController = require('../controllers/material.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const {
  validateUpdateMaterial,
  validateCreateMaterial,
  validateSetExternalSymbol,
} = require('../validators/material.validator');

router.get('/', authMiddleware, materialController.listMaterials);
router.post('/', authMiddleware, validate(validateCreateMaterial), materialController.addMaterial);
router.patch('/:materialId', authMiddleware, validate(validateUpdateMaterial), materialController.updateMaterial);

// Phase B: set or clear the external commodity symbol for a tracked material.
// PATCH before /:materialId/... to avoid shadowing the general /:materialId route.
router.patch('/:materialId/external-symbol', authMiddleware, validate(validateSetExternalSymbol), materialController.setExternalSymbol);

module.exports = router;
