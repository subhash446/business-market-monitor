'use strict';

/**
 * Unit & Integration tests for WhatsApp Copilot In-App Controller (V3-M4).
 * Tests parseQuote and getHistory handlers.
 */

const whatsappCopilotController = require('../src/controllers/whatsappCopilot.controller');
const materialRepository = require('../src/repositories/material.repository');
const priceRepository = require('../src/repositories/price.repository');
const whatsappInboundRepository = require('../src/repositories/whatsappInbound.repository');
const businessRepository = require('../src/repositories/business.repository');

describe('WhatsApp Copilot In-App Controller (V3-M4)', () => {
  const TEST_USER_ID = 42;
  const TEST_BUSINESS_ID = 10;

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
    return res;
  }

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(businessRepository, 'findByUserId').mockResolvedValue({
      id: TEST_BUSINESS_ID,
      user_id: TEST_USER_ID,
      name: 'Apex Polymer Packaging',
      contact_phone: '+919876543210',
    });
  });

  // =========================================================================
  // 1. parseQuote (POST)
  // =========================================================================
  describe('parseQuote', () => {
    test('rejects empty or whitespace text with 400 VALIDATION_ERROR', async () => {
      const req = {
        auth: { userId: TEST_USER_ID, businessId: TEST_BUSINESS_ID },
        body: { text: '   ' },
      };
      const res = createMockRes();
      const next = jest.fn();

      await whatsappCopilotController.parseQuote(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Quote text is required');
    });

    test('returns 400 NO_TRACKED_MATERIALS if business has no tracked materials', async () => {
      jest.spyOn(materialRepository, 'findTrackedForBusiness').mockResolvedValue([]);

      const req = {
        auth: { userId: TEST_USER_ID, businessId: TEST_BUSINESS_ID },
        body: { text: 'PET Resin 123.50/kg' },
      };
      const res = createMockRes();
      const next = jest.fn();

      await whatsappCopilotController.parseQuote(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('Please track at least one material');
    });

    test('preview-safe parsing (autoLog: false) performs zero DB writes', async () => {
      jest.spyOn(materialRepository, 'findTrackedForBusiness').mockResolvedValue([
        { id: 1, name: 'PET Resin', unit: 'kg', isTracked: true, landedUnitFactor: null },
      ]);

      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        price: '115.0000',
        currency: 'INR',
      });

      const createPriceSpy = jest.spyOn(priceRepository, 'create');
      const createInboundSpy = jest.spyOn(whatsappInboundRepository, 'createInboundMessage');

      const req = {
        auth: { userId: TEST_USER_ID, businessId: TEST_BUSINESS_ID },
        body: {
          text: 'PET Resin Rs 123.50/kg Sharma Polymers',
          autoLog: false,
        },
      };
      const res = createMockRes();
      const next = jest.fn();

      await whatsappCopilotController.parseQuote(req, res, next);

      expect(res.body.success).toBe(true);
      expect(res.body.data.parsed.isMatch).toBe(true);
      expect(res.body.data.parsed.matchedMaterial.name).toBe('PET Resin');
      expect(res.body.data.parsed.rawPrice).toBe(123.5);
      expect(res.body.data.drafts).toBeDefined();
      expect(res.body.data.drafts.variancePercent).toBe(7.39);
      expect(res.body.data.drafts.counterOfferMessage).toContain('₹123.5/kg');
      expect(res.body.data.loggedPoint).toBeNull();

      // Zero writes
      expect(createPriceSpy).not.toHaveBeenCalled();
      expect(createInboundSpy).not.toHaveBeenCalled();
    });

    test('rejects autoLog with 400 UNIT_MISMATCH on incompatible units (e.g. pcs vs kg)', async () => {
      jest.spyOn(materialRepository, 'findTrackedForBusiness').mockResolvedValue([
        { id: 1, name: 'Shrink Film', unit: 'kg', isTracked: true },
      ]);

      const req = {
        auth: { userId: TEST_USER_ID, businessId: TEST_BUSINESS_ID },
        body: {
          text: 'Shrink Film Rs 50/pcs from vendor',
          autoLog: true,
        },
      };
      const res = createMockRes();
      const next = jest.fn();

      await whatsappCopilotController.parseQuote(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain('incompatible unit mismatch');
    });

    test('autoLog: true logs SUPPLIER_QUOTE and records audit entry with inapp_ uuid', async () => {
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

      jest.spyOn(priceRepository, 'create').mockResolvedValue({
        id: 105,
        price: '123.5000',
        currency: 'INR',
        unit_label: 'kg',
        recorded_at: new Date('2026-11-22T10:00:00Z'),
      });

      const auditSpy = jest.spyOn(whatsappInboundRepository, 'createInboundMessage').mockResolvedValue({
        id: 77,
      });

      const req = {
        auth: { userId: TEST_USER_ID, businessId: TEST_BUSINESS_ID },
        body: {
          text: 'PET Resin Rs 123.50/kg Sharma Polymers',
          autoLog: true,
        },
      };
      const res = createMockRes();
      const next = jest.fn();

      await whatsappCopilotController.parseQuote(req, res, next);

      expect(res.body.success).toBe(true);
      expect(res.body.data.loggedPoint).toBeDefined();
      expect(res.body.data.loggedPoint.id).toBe(105);
      expect(res.body.data.loggedPoint.price).toBe(123.5);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: TEST_BUSINESS_ID,
          senderPhoneMasked: 'IN_APP_WEB',
          parsedPrice: 123.5,
          loggedPricePointId: 105,
          replyStatus: 'SKIPPED',
        })
      );
    });

    test('supports user materialId override', async () => {
      jest.spyOn(materialRepository, 'findTrackedForBusiness').mockResolvedValue([
        { id: 1, name: 'PET Resin', unit: 'kg', isTracked: true },
        { id: 4, name: 'Shrink Film', unit: 'kg', isTracked: true },
      ]);

      const req = {
        auth: { userId: TEST_USER_ID, businessId: TEST_BUSINESS_ID },
        body: {
          text: 'Rate today is 112.50/kg from supplier',
          materialId: 4,
          autoLog: false,
        },
      };
      const res = createMockRes();
      const next = jest.fn();

      await whatsappCopilotController.parseQuote(req, res, next);

      expect(res.body.success).toBe(true);
      expect(res.body.data.parsed.matchedMaterial.id).toBe(4);
      expect(res.body.data.parsed.matchedMaterial.name).toBe('Shrink Film');
    });
  });

  // =========================================================================
  // 2. getHistory (GET)
  // =========================================================================
  describe('getHistory', () => {
    test('returns recent copilot and inbound messages array', async () => {
      jest.spyOn(whatsappInboundRepository, 'listRecentByBusinessId').mockResolvedValue([
        {
          id: 1,
          external_message_id: 'inapp_123',
          sender_phone_masked: 'IN_APP_WEB',
          raw_text: 'PET Resin 123.50/kg',
          parsed_material_id: 1,
          material_name: 'PET Resin',
          parsed_price: '123.5000',
          parsed_currency: 'INR',
          parsed_unit: 'kg',
          parsed_supplier_name: 'Sharma Polymers',
          logged_price_point_id: 101,
          suggested_counter_low: '115.0000',
          suggested_counter_high: '119.0000',
          processing_status: 'PARSED',
          reply_status: 'SKIPPED',
          created_at: new Date('2026-11-22T10:00:00Z'),
        },
      ]);

      const req = {
        auth: { userId: TEST_USER_ID, businessId: TEST_BUSINESS_ID },
        query: {},
      };
      const res = createMockRes();
      const next = jest.fn();

      await whatsappCopilotController.getHistory(req, res, next);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].materialName).toBe('PET Resin');
      expect(res.body.data[0].price).toBe(123.5);
      expect(res.body.data[0].senderMasked).toBe('IN_APP_WEB');
    });
  });
});
