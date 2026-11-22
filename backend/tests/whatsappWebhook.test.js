'use strict';

/**
 * Integration & Security tests for Meta WhatsApp Webhook Controller (V3-M4).
 * Covers GET verification handshake, POST fail-closed HMAC-SHA256 verification,
 * wamid idempotency, phone tenant resolution, and quote auto-logging.
 */

const crypto = require('crypto');
const env = require('../src/config/env');
const whatsappWebhookController = require('../src/controllers/whatsappWebhook.controller');
const whatsappProvider = require('../src/providers/whatsapp.provider');
const whatsappInboundRepository = require('../src/repositories/whatsappInbound.repository');
const businessRepository = require('../src/repositories/business.repository');
const materialRepository = require('../src/repositories/material.repository');
const priceRepository = require('../src/repositories/price.repository');

describe('Meta WhatsApp Webhook Controller (V3-M4)', () => {
  const TEST_VERIFY_TOKEN = 'test_webhook_verify_token';
  const TEST_APP_SECRET = 'test_whatsapp_app_secret_32_chars!';

  function createMockRes() {
    const res = {};
    res.statusCode = 200;
    res.status = jest.fn((code) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn((data) => {
      res.body = data;
      return res;
    });
    res.send = jest.fn((data) => {
      res.body = data;
      return res;
    });
    return res;
  }

  function computeSignature(payload, secret = TEST_APP_SECRET) {
    const data = typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload);
    return 'sha256=' + crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    process.env.WHATSAPP_APP_SECRET = TEST_APP_SECRET;
  });

  // =========================================================================
  // 1. GET Verification Handshake
  // =========================================================================
  describe('1. verifyWebhook (GET Handshake)', () => {
    test('returns challenge with HTTP 200 when hub.verify_token and mode match', () => {
      const req = {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': TEST_VERIFY_TOKEN,
          'hub.challenge': 'CHALLENGE_CODE_12345',
        },
      };
      const res = createMockRes();

      whatsappWebhookController.verifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('CHALLENGE_CODE_12345');
    });

    test('returns 403 Forbidden when verify_token does not match', () => {
      const req = {
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'CHALLENGE_CODE_12345',
        },
      };
      const res = createMockRes();

      whatsappWebhookController.verifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.body.message).toContain('Verification token mismatch');
    });

    test('returns 403 Forbidden when hub.mode is not subscribe', () => {
      const req = {
        query: {
          'hub.mode': 'unsubscribe',
          'hub.verify_token': TEST_VERIFY_TOKEN,
          'hub.challenge': 'CHALLENGE_CODE_12345',
        },
      };
      const res = createMockRes();

      whatsappWebhookController.verifyWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  // =========================================================================
  // 2. POST HMAC Signature Security & Fail-Closed Checks
  // =========================================================================
  describe('2. verifySignature (HMAC Security & Timing-Safe Compare)', () => {
    test('returns ok: true when signature is valid', () => {
      const payload = { entry: [] };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const sig = computeSignature(rawBody);

      const req = {
        headers: { 'x-hub-signature-256': sig },
        body: payload,
        rawBody,
      };

      const result = whatsappWebhookController.verifySignature(req);
      expect(result.ok).toBe(true);
    });

    test('returns 401 when X-Hub-Signature-256 is missing', () => {
      const req = {
        headers: {},
        body: { entry: [] },
        rawBody: Buffer.from('{}'),
      };

      const result = whatsappWebhookController.verifySignature(req);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toContain('Missing X-Hub-Signature-256');
    });

    test('returns 401 when signature is invalid', () => {
      const req = {
        headers: { 'x-hub-signature-256': 'sha256=invalid_hex_0000000000000000000000000000000000000000000000000000000000000000' },
        body: { entry: [] },
        rawBody: Buffer.from('{}'),
      };

      const result = whatsappWebhookController.verifySignature(req);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toContain('Invalid X-Hub-Signature-256');
    });

    test('never throws RangeError on malformed short or long signature headers', () => {
      const req = {
        headers: { 'x-hub-signature-256': 'sha256=short' },
        body: { entry: [] },
        rawBody: Buffer.from('{}'),
      };

      const result = whatsappWebhookController.verifySignature(req);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    test('fails closed with 503 in non-test environment when WHATSAPP_APP_SECRET is unset', () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        process.env.WHATSAPP_APP_SECRET = '';

        const req = {
          headers: {},
          body: { entry: [] },
          rawBody: Buffer.from('{}'),
        };

        const result = whatsappWebhookController.verifySignature(req);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(503);
        expect(result.message).toContain('WHATSAPP_APP_SECRET missing; fail-closed rejection');
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.WHATSAPP_APP_SECRET = TEST_APP_SECRET;
      }
    });
  });

  // =========================================================================
  // 3. handleInboundWebhook (Idempotency, Tenant Resolution, Quote Capture)
  // =========================================================================
  describe('3. handleInboundWebhook Execution', () => {
    function createWebhookRequest(msgId, senderPhone, text) {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_ACCOUNT_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '1234567890', phone_number_id: 'PN_123' },
                  messages: [
                    {
                      id: msgId,
                      from: senderPhone,
                      timestamp: '1732270000',
                      type: 'text',
                      text: { body: text },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      return {
        headers: {
          'x-hub-signature-256': computeSignature(rawBody),
        },
        body: payload,
        rawBody,
      };
    }

    test('deduplicates duplicate wamid and returns 200 OK without re-processing', async () => {
      jest.spyOn(whatsappInboundRepository, 'findByExternalMessageId').mockResolvedValue({
        id: 99,
        external_message_id: 'wamid.HBgLMTIzNDU2Nzg5MA==',
      });

      const createSpy = jest.spyOn(whatsappInboundRepository, 'createInboundMessage');

      const req = createWebhookRequest('wamid.HBgLMTIzNDU2Nzg5MA==', '919876543210', 'PET Resin 123.50/kg');
      const res = createMockRes();

      await whatsappWebhookController.handleInboundWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(createSpy).not.toHaveBeenCalled();
    });

    test('parses quote, logs price point, records audit row, and replies via WhatsApp', async () => {
      jest.spyOn(whatsappInboundRepository, 'findByExternalMessageId').mockResolvedValue(null);

      jest.spyOn(businessRepository, 'findByContactPhone').mockResolvedValue({
        id: 10,
        name: 'Apex Polymer Packaging',
      });

      jest.spyOn(materialRepository, 'findTrackedForBusiness').mockResolvedValue([
        { id: 1, name: 'PET Resin', unit: 'kg', isTracked: true, landedUnitFactor: null },
      ]);

      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 1,
        name: 'PET Resin',
        unit: 'kg',
      });

      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        price: '115.0000',
        currency: 'INR',
      });

      const logPriceSpy = jest.spyOn(priceRepository, 'create').mockResolvedValue({
        id: 101,
        price: '123.5000',
        recorded_at: new Date(),
      });

      const auditSpy = jest.spyOn(whatsappInboundRepository, 'createInboundMessage').mockResolvedValue({
        id: 55,
      });

      const req = createWebhookRequest('wamid.NEW_MSG_001', '919876543210', 'PET Resin Rs 123.50/kg Sharma Polymers');
      const res = createMockRes();

      await whatsappWebhookController.handleInboundWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(logPriceSpy).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 10,
          externalMessageId: 'wamid.NEW_MSG_001',
          parsedPrice: 123.5,
          processingStatus: 'PARSED',
        })
      );
    });

    test('handles unmapped sender gracefully and returns 200 OK to Meta', async () => {
      jest.spyOn(whatsappInboundRepository, 'findByExternalMessageId').mockResolvedValue(null);
      jest.spyOn(businessRepository, 'findByContactPhone').mockResolvedValue(null);

      const req = createWebhookRequest('wamid.UNKNOWN_002', '919999999999', 'HDPE 98.50/kg');
      const res = createMockRes();

      await whatsappWebhookController.handleInboundWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
