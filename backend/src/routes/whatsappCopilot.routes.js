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

router.post('/parse-quote', auth, whatsappCopilotController.parseQuote);
router.get('/history', auth, whatsappCopilotController.getHistory);

module.exports = router;
