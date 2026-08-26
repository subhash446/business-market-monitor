const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alert.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { validateCreateRule, validateUpdateRule } = require('../validators/alert.validator');

router.get('/rules', authMiddleware, alertController.listAlertRules);
router.post('/rules', authMiddleware, validate(validateCreateRule), alertController.createAlertRule);
router.patch('/rules/:ruleId', authMiddleware, validate(validateUpdateRule), alertController.updateAlertRule);
router.delete('/rules/:ruleId', authMiddleware, alertController.deleteAlertRule);
router.get('/events', authMiddleware, alertController.listAlertEvents);

module.exports = router;
