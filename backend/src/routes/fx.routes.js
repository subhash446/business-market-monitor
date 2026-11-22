'use strict';

const express = require('express');
const router = express.Router();
const fxController = require('../controllers/fx.controller');
const authMiddleware = require('../middleware/auth.middleware');

// GET /api/v1/fx/latest?base=USD&quote=INR — V3-M3
router.get('/latest', authMiddleware, fxController.getLatestFxRate);

module.exports = router;
