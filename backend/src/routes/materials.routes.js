const express = require('express');
const router = express.Router();
const materialController = require('../controllers/material.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { validateUpdateMaterial, validateCreateMaterial } = require('../validators/material.validator');

router.get('/', authMiddleware, materialController.listMaterials);
router.post('/', authMiddleware, validate(validateCreateMaterial), materialController.addMaterial);
router.patch('/:materialId', authMiddleware, validate(validateUpdateMaterial), materialController.updateMaterial);

module.exports = router;
