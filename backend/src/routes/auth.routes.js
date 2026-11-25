const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const rateLimiter = require('../middleware/rateLimiter.middleware');
const validate = require('../middleware/validate.middleware');
const {
  validateRegister,
  validateLogin,
  validateRefresh,
  validateRequestPasswordReset,
  validateConfirmPasswordReset,
  validateEmailOtpRequest,
  validateRegisterVerifyOtp,
} = require('../validators/auth.validator');

// Public (Document 5 §2.3)
router.get('/config', authController.getConfig);
router.post('/register', rateLimiter, validate(validateRegister), authController.register);
router.post('/register/verify-otp', rateLimiter, validate(validateRegisterVerifyOtp), authController.registerVerifyOtp);
router.post('/login', rateLimiter, validate(validateLogin), authController.login);
router.post('/google', rateLimiter, authController.googleLogin);
router.post('/email-otp/request', rateLimiter, validate(validateEmailOtpRequest), authController.requestEmailOtp);
router.post('/email-otp/verify', rateLimiter, authController.verifyEmailOtp);
router.post('/refresh', validate(validateRefresh), authController.refresh);
router.post('/password-reset/request', rateLimiter, validate(validateRequestPasswordReset), authController.requestPasswordReset);
router.post('/password-reset/confirm', rateLimiter, validate(validateConfirmPasswordReset), authController.confirmPasswordReset);
router.get('/email-verification/confirm', authController.confirmEmailVerification);

// Protected
router.get('/me', authMiddleware, authController.getMe);
router.post('/logout', authMiddleware, authController.logout);
router.post('/email-verification/request', authMiddleware, authController.requestEmailVerification);

module.exports = router;
