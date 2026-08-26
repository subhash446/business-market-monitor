const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rateLimiter = require('../middleware/rateLimiter.middleware');
const validate = require('../middleware/validate.middleware');
const { validateRegister, validateLogin, validateRefresh, validateRequestPasswordReset, validateConfirmPasswordReset } = require('../validators/auth.validator');

// Public (Document 5 §2.3)
router.post('/register', rateLimiter, validate(validateRegister), authController.register);
router.post('/login', rateLimiter, validate(validateLogin), authController.login);
router.post('/refresh', validate(validateRefresh), authController.refresh);
router.post('/password-reset/request', rateLimiter, validate(validateRequestPasswordReset), authController.requestPasswordReset);
router.post('/password-reset/confirm', validate(validateConfirmPasswordReset), authController.confirmPasswordReset);
router.get('/email-verification/confirm', authController.confirmEmailVerification);

// Protected
router.post('/logout', authMiddleware, authController.logout);
router.post('/email-verification/request', authMiddleware, authController.requestEmailVerification);

module.exports = router;
