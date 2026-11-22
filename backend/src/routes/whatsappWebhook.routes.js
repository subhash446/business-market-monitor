'use strict';

/**
 * WhatsApp Meta Webhook Routes (V3-M4).
 *
 * Mounts:
 *   - GET  /api/v1/webhooks/whatsapp (Verification handshake)
 *   - POST /api/v1/webhooks/whatsapp (Inbound event delivery)
 */

const express = require('express');
const router = express.Router();
const whatsappWebhookController = require('../controllers/whatsappWebhook.controller');

router.get('/', whatsappWebhookController.verifyWebhook);
router.post('/', whatsappWebhookController.handleInboundWebhook);

module.exports = router;
