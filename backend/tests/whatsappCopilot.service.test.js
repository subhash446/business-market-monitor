'use strict';

/**
 * Unit & Edge-case tests for WhatsApp Copilot Service (V3-M4).
 * Covers Indian SME quote parsing, comma stripping, unit conversions,
 * incompatible unit guards, negotiation counter bounds, and duplicate safety.
 */

const {
  parseIndianNumber,
  normalizeUnit,
  evaluateUnitConversion,
  parseWhatsAppQuote,
  generateNegotiationDrafts,
  logParsedSupplierQuote,
} = require('../src/services/whatsappCopilot.service');
const materialRepository = require('../src/repositories/material.repository');
const priceRepository = require('../src/repositories/price.repository');
const alertEvaluationService = require('../src/services/alertEvaluation.service');

describe('WhatsApp Copilot Service (V3-M4)', () => {
  const mockTrackedMaterials = [
    { id: 1, name: 'PET Resin', unit: 'kg', isTracked: true, landedUnitFactor: 0.00735 },
    { id: 2, name: 'Virgin HDPE Granules', unit: 'kg', isTracked: true },
    { id: 3, name: 'Wheat', unit: 'kg', isTracked: true },
    { id: 4, name: 'Shrink Film', unit: 'kg', isTracked: true },
    { id: 5, name: 'PP Granules', unit: 'kg', isTracked: true },
    { id: 6, name: 'Mustard Oil', unit: 'litre', isTracked: true },
  ];

  // =========================================================================
  // 1. parseIndianNumber & Comma Handling
  // =========================================================================
  describe('1. parseIndianNumber & Comma Stripping', () => {
    test('strips standard and Indian numbering commas correctly', () => {
      expect(parseIndianNumber('1,14,500')).toBe(114500);
      expect(parseIndianNumber('2,640')).toBe(2640);
      expect(parseIndianNumber('2,640.50')).toBe(2640.5);
      expect(parseIndianNumber('123.50')).toBe(123.5);
      expect(parseIndianNumber('10,00,000')).toBe(1000000);
    });

    test('returns null for non-numeric or non-positive values', () => {
      expect(parseIndianNumber(null)).toBeNull();
      expect(parseIndianNumber('abc')).toBeNull();
      expect(parseIndianNumber('0')).toBeNull();
      expect(parseIndianNumber('-50')).toBeNull();
    });
  });

  // =========================================================================
  // 2. Unit Normalization & Safe Conversion
  // =========================================================================
  describe('2. Unit Normalization & Conversion', () => {
    test('normalizes variants of mass and volume units', () => {
      expect(normalizeUnit('kgs')).toBe('kg');
      expect(normalizeUnit('Kilogram')).toBe('kg');
      expect(normalizeUnit('MT')).toBe('MT');
      expect(normalizeUnit('metric tons')).toBe('MT');
      expect(normalizeUnit('qtl')).toBe('quintal');
      expect(normalizeUnit('quintals')).toBe('quintal');
      expect(normalizeUnit('ltr')).toBe('litre');
      expect(normalizeUnit('pieces')).toBe('pcs');
    });

    test('converts MT to kg correctly (1 MT = 1000 kg)', () => {
      const conv = evaluateUnitConversion(114500, 'MT', 'kg');
      expect(conv.convertedPrice).toBe(114.5);
      expect(conv.targetUnit).toBe('kg');
      expect(conv.unitMismatch).toBe(false);
      expect(conv.conversionFactor).toBe(1000);
      expect(conv.unitConversionNote).toContain('1 MT = 1000 kg');
    });

    test('converts quintal to kg correctly (1 quintal = 100 kg)', () => {
      const conv = evaluateUnitConversion(2640, 'quintal', 'kg');
      expect(conv.convertedPrice).toBe(26.4);
      expect(conv.targetUnit).toBe('kg');
      expect(conv.unitMismatch).toBe(false);
      expect(conv.conversionFactor).toBe(100);
      expect(conv.unitConversionNote).toContain('1 quintal = 100 kg');
    });

    test('flags incompatible unit conversion with unitMismatch: true', () => {
      const conv = evaluateUnitConversion(50, 'pcs', 'kg');
      expect(conv.unitMismatch).toBe(true);
      expect(conv.conversionFactor).toBeNull();
      expect(conv.unitConversionNote).toContain('Unit mismatch');
    });

    test('same-unit returns 1.0 factor without conversion note', () => {
      const conv = evaluateUnitConversion(120, 'kg', 'kg');
      expect(conv.convertedPrice).toBe(120);
      expect(conv.unitMismatch).toBe(false);
      expect(conv.conversionFactor).toBe(1.0);
      expect(conv.unitConversionNote).toBeNull();
    });
  });

  // =========================================================================
  // 3. Indian SME WhatsApp Quote Text Parsing (15+ Phrasings)
  // =========================================================================
  describe('3. Indian SME Quote Text Parsing', () => {
    const quoteCases = [
      {
        text: 'PET Resin Rs 123.50/kg Sharma Polymers',
        expectedMat: 'PET Resin',
        expectedPrice: 123.5,
        expectedUnit: 'kg',
        expectedSupplier: 'Sharma Polymers',
      },
      {
        text: 'HDPE @ 98.20 per kg',
        expectedMat: 'Virgin HDPE Granules',
        expectedPrice: 98.2,
        expectedUnit: 'kg',
      },
      {
        text: 'Wheat 2640/qtl Indore Mandi',
        expectedMat: 'Wheat',
        expectedPrice: 2640,
        expectedUnit: 'quintal',
        expectedSupplier: 'Indore Mandi',
      },
      {
        text: '₹118.5/kg for Shrink Film',
        expectedMat: 'Shrink Film',
        expectedPrice: 118.5,
        expectedUnit: 'kg',
      },
      {
        text: 'Rs. 1,14,500/MT Virgin HDPE from Reliance',
        expectedMat: 'Virgin HDPE Granules',
        expectedPrice: 114500,
        expectedUnit: 'MT',
        expectedSupplier: 'Reliance',
      },
      {
        text: 'Wheat ₹2,640 per quintal MP Mandi',
        expectedMat: 'Wheat',
        expectedPrice: 2640,
        expectedUnit: 'quintal',
        expectedSupplier: 'MP Mandi',
      },
      {
        text: 'PP Granules at Rs 105 per kg ABC Plastics',
        expectedMat: 'PP Granules',
        expectedPrice: 105,
        expectedUnit: 'kg',
        expectedSupplier: 'ABC Plastics',
      },
      {
        text: 'Special offer: Shrink Film 112.00/kg min order 500kg',
        expectedMat: 'Shrink Film',
        expectedPrice: 112,
        expectedUnit: 'kg',
      },
      {
        text: 'Hi sir, PP Granules rate today is 99.50/kg, Sharma Bros',
        expectedMat: 'PP Granules',
        expectedPrice: 99.5,
        expectedUnit: 'kg',
        expectedSupplier: 'Sharma Bros',
      },
      {
        text: 'Mustard Oil @ ₹142.50 per ltr from Adani Wilmar',
        expectedMat: 'Mustard Oil',
        expectedPrice: 142.5,
        expectedUnit: 'litre',
        expectedSupplier: 'Adani Wilmar',
      },
      {
        text: 'Virgin HDPE Granules 102/kg',
        expectedMat: 'Virgin HDPE Granules',
        expectedPrice: 102,
        expectedUnit: 'kg',
      },
      {
        text: 'PET Resin Rs. 125 per kg',
        expectedMat: 'PET Resin',
        expectedPrice: 125,
        expectedUnit: 'kg',
      },
      {
        text: 'Shrink Film Rs 115.00/kg M/s Balaji Packaging',
        expectedMat: 'Shrink Film',
        expectedPrice: 115,
        expectedUnit: 'kg',
        expectedSupplier: 'Balaji Packaging',
      },
      {
        text: 'Imported PET Resin $1.45/kg from Global Traders',
        expectedMat: 'PET Resin',
        expectedPrice: 1.45,
        expectedUnit: 'kg',
        expectedCurrency: 'USD',
      },
    ];

    test.each(quoteCases)('parses "%s"', ({ text, expectedMat, expectedPrice, expectedUnit, expectedSupplier, expectedCurrency }) => {
      const parsed = parseWhatsAppQuote(text, mockTrackedMaterials);
      expect(parsed.isMatch).toBe(true);
      expect(parsed.rawPrice).toBe(expectedPrice);
      if (expectedUnit) expect(parsed.rawUnit).toBe(expectedUnit);
      if (expectedMat) expect(parsed.matchedMaterial.name).toBe(expectedMat);
      if (expectedSupplier) expect(parsed.supplierName).toContain(expectedSupplier);
      if (expectedCurrency) expect(parsed.currency).toBe(expectedCurrency);
    });

    test('safely rejects conversational non-quote noise messages', () => {
      const noise = [
        'Good morning sir, please call me when free',
        'Can you share your company catalog and price list?',
        'Order #104 has been dispatched via truck today',
        '',
        null,
      ];

      noise.forEach((msg) => {
        const parsed = parseWhatsAppQuote(msg, mockTrackedMaterials);
        expect(parsed.isMatch).toBe(false);
      });
    });
  });

  // =========================================================================
  // 4. Negotiation Counter-Offer & RFQ Generation
  // =========================================================================
  describe('4. Counter-Offer & Negotiation Drafts', () => {
    test('computes counter-offer when quote is above market benchmark', () => {
      const drafts = generateNegotiationDrafts({
        materialName: 'PET Resin',
        materialUnit: 'kg',
        quotedPrice: 125,
        quotedUnit: 'kg',
        currency: 'INR',
        supplierName: 'Sharma Polymers',
        benchmarkPrice: 115,
      });

      expect(drafts.variancePercent).toBe(8.7);
      expect(drafts.suggestedCounterLow).toBeLessThanOrEqual(drafts.suggestedCounterHigh);
      expect(drafts.suggestedCounterLow).toBeGreaterThan(0);
      expect(drafts.suggestedCounterHigh).toBeGreaterThan(0);
      expect(drafts.counterOfferMessage).toContain('₹125/kg');
      expect(drafts.counterOfferMessage).toContain('PET Resin');
      expect(drafts.counterOfferMessage).toContain('target counter-offer');
      expect(drafts.waMeLink).toContain('https://wa.me/?text=');
    });

    test('computes lock-in counter-offer when quote is below market benchmark', () => {
      const drafts = generateNegotiationDrafts({
        materialName: 'HDPE Granules',
        materialUnit: 'kg',
        quotedPrice: 95,
        quotedUnit: 'kg',
        currency: 'INR',
        benchmarkPrice: 105,
      });

      expect(drafts.variancePercent).toBe(-9.52);
      expect(drafts.suggestedCounterLow).toBeLessThanOrEqual(drafts.suggestedCounterHigh);
      expect(drafts.suggestedCounterHigh).toBe(95); // Lock in quoted rate
    });

    test('integrates landed parity benchmark when present', () => {
      const drafts = generateNegotiationDrafts({
        materialName: 'PET Resin',
        materialUnit: 'kg',
        quotedPrice: 120,
        quotedUnit: 'kg',
        landedParityBenchmark: 110.5,
      });

      expect(drafts.benchmarkPrice).toBe(110.5);
      expect(drafts.variancePercent).toBe(8.6);
      expect(drafts.counterOfferMessage).toContain('₹110.50/kg');
    });

    test('generates professional RFQ inquiry draft', () => {
      const drafts = generateNegotiationDrafts({
        materialName: 'Wheat',
        materialUnit: 'kg',
        quotedPrice: 26.4,
        quotedUnit: 'kg',
        supplierName: 'Indore Mandi Traders',
      });

      expect(drafts.rfqMessage).toContain('Hi Indore Mandi Traders');
      expect(drafts.rfqMessage).toContain('Wheat (kg)');
      expect(drafts.rfqMessage).toContain('best quote and delivery timeline');
    });
  });

  // =========================================================================
  // 5. logParsedSupplierQuote & Same-Day Duplicate Handling
  // =========================================================================
  describe('5. logParsedSupplierQuote & Same-Day Duplicate Safety', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    test('logs supplier quote successfully and evaluates alerts', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 1,
        name: 'PET Resin',
        unit: 'kg',
      });

      jest.spyOn(priceRepository, 'create').mockResolvedValue({
        id: 42,
        price: '123.5000',
        source: 'SUPPLIER_INTEGRATION',
        data_class: 'SUPPLIER_QUOTE',
        recorded_at: new Date(),
      });

      const alertSpy = jest.spyOn(alertEvaluationService, 'evaluateMaterial').mockResolvedValue();

      const res = await logParsedSupplierQuote({
        businessId: 10,
        materialId: 1,
        price: 123.5,
        supplierName: 'Sharma Polymers',
      });

      expect(res.id).toBe(42);
      expect(alertSpy).toHaveBeenCalledWith(10, 1);
    });

    test('recovers gracefully from same-second ER_DUP_ENTRY without throwing 500', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 1,
        name: 'PET Resin',
        unit: 'kg',
      });

      const dupErr = new Error('Duplicate entry for key uq_price_points_material_date_source');
      dupErr.code = 'ER_DUP_ENTRY';
      dupErr.errno = 1062;

      // First call fails with duplicate; second retry succeeds
      let calls = 0;
      jest.spyOn(priceRepository, 'create').mockImplementation(async () => {
        calls++;
        if (calls === 1) throw dupErr;
        return {
          id: 43,
          price: '123.5000',
          source: 'SUPPLIER_INTEGRATION',
          recorded_at: new Date(),
        };
      });

      const res = await logParsedSupplierQuote({
        businessId: 10,
        materialId: 1,
        price: 123.5,
      });

      expect(calls).toBe(2);
      expect(res.id).toBe(43);
    });
  });
});
