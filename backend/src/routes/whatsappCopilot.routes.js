'use strict';

/**
 * WhatsApp Copilot Routes (V3-M4).
 *
 * Mounts:
 *   - POST /api/v1/copilot/whatsapp/parse-quote (Preview & optional autoLog)
 *   - GET  /api/v1/copilot/whatsapp/history (Recent parsed quotes)
 */

const express = require('express');
const router = express.Router();
const whatsappCopilotController = require('../controllers/whatsappCopilot.controller');
const auth = require('../middleware/auth.middleware');
const { attachBusinessRole } = require('../middleware/rbac.middleware');

router.post('/parse-quote', auth, attachBusinessRole, whatsappCopilotController.parseQuote);
router.get('/history', auth, attachBusinessRole, whatsappCopilotController.getHistory);

module.exports = router;
