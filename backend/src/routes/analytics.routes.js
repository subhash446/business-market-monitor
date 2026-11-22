'use strict';

/**
 * Analytics Routes (V3-M5).
 *
 * Mounts:
 *   - GET /api/v1/analytics/savings-roi (Procurement Savings ROI calculation)
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const auth = require('../middleware/auth.middleware');
const { attachBusinessRole } = require('../middleware/rbac.middleware');

router.get('/savings-roi', auth, attachBusinessRole, analyticsController.getSavingsRoi);

module.exports = router;
