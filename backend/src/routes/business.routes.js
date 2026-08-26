const express = require('express');
const router = express.Router();
const businessController = require('../controllers/business.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { validateCreateBusiness, validateUpdateBusiness } = require('../validators/business.validator');

router.post('/', authMiddleware, validate(validateCreateBusiness), businessController.createBusiness);
router.get('/', authMiddleware, businessController.getBusiness);
router.put('/', authMiddleware, validate(validateUpdateBusiness), businessController.updateBusiness);

module.exports = router;
