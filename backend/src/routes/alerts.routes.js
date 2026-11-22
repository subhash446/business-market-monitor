const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alert.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { attachBusinessRole, requireRole } = require('../middleware/rbac.middleware');
const validate = require('../middleware/validate.middleware');
const { validateCreateRule, validateUpdateRule } = require('../validators/alert.validator');

router.get('/rules', authMiddleware, alertController.listAlertRules);
router.post(
  '/rules',
  authMiddleware,
  attachBusinessRole,
  requireRole('OWNER', 'PURCHASE_MANAGER'),
  validate(validateCreateRule),
  alertController.createAlertRule
);
router.patch(
  '/rules/:ruleId',
  authMiddleware,
  attachBusinessRole,
  requireRole('OWNER', 'PURCHASE_MANAGER'),
  validate(validateUpdateRule),
  alertController.updateAlertRule
);
router.delete(
  '/rules/:ruleId',
  authMiddleware,
  attachBusinessRole,
  requireRole('OWNER', 'PURCHASE_MANAGER'),
  alertController.deleteAlertRule
);
router.get('/events', authMiddleware, alertController.listAlertEvents);

module.exports = router;
