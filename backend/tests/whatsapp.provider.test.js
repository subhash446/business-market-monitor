'use strict';

/**
 * Unit tests for WhatsApp Cloud API Provider (whatsapp.provider.js).
 */

const env = require('../src/config/env');
const whatsappProvider = require('../src/providers/whatsapp.provider');

describe('WhatsApp Provider (whatsapp.provider.js)', () => {
  describe('E.164 Phone Validation', () => {
    test('accepts valid E.164 phone numbers with country code and leading +', () => {
      expect(whatsappProvider.isValidE164('+919876543210')).toBe(true);
      expect(whatsappProvider.isValidE164('+14155552671')).toBe(true);
      expect(whatsappProvider.isValidE164('+447911123456')).toBe(true);
    });

    test('rejects numbers without leading +, invalid formats, or non-digits', () => {
      expect(whatsappProvider.isValidE164('9876543210')).toBe(false);
      expect(whatsappProvider.isValidE164('+0123456789')).toBe(false); // Country code cannot start with 0
      expect(whatsappProvider.isValidE164('+12345')).toBe(false); // Too short
      expect(whatsappProvider.isValidE164('+1234567890123456')).toBe(false); // Exceeds 15 digits
      expect(whatsappProvider.isValidE164('')).toBe(false);
      expect(whatsappProvider.isValidE164(null)).toBe(false);
      expect(whatsappProvider.isValidE164(undefined)).toBe(false);
    });
  });

  describe('Phone Redaction & Sanitization', () => {
    test('redactPhoneNumber masks middle digits', () => {
      expect(whatsappProvider.redactPhoneNumber('+919876543210')).toBe('+91****3210');
      expect(whatsappProvider.redactPhoneNumber('+14155552671')).toBe('+14****2671');
      expect(whatsappProvider.redactPhoneNumber('1234')).toBe('***');
    });

    test('sanitizeErrorMessage strips Bearer tokens and full phone numbers', () => {
      const sanitized = whatsappProvider.sanitizeErrorMessage(
        new Error('Failed sending to +919876543210 with Bearer EAAXyZ1234567890')
      );
      expect(sanitized).not.toContain('EAAXyZ1234567890');
      expect(sanitized).not.toContain('+919876543210');
      expect(sanitized).toContain('Bearer ***');
      expect(sanitized).toContain('+91****3210');
    });
  });

  describe('Message Formatting', () => {
    test('formatAlertMessage constructs expected alert structure', () => {
      const text = whatsappProvider.formatAlertMessage({
        materialName: 'PET Resin',
        conditionType: 'PRICE_ABOVE',
        thresholdType: 'ABSOLUTE',
        thresholdPrice: 100,
        triggeredPrice: 110,
        triggeredChangePercent: 10,
        currency: 'INR',
        unitLabel: 'kg',
        triggeredAt: '2026-11-14T10:00:00Z',
      });

      expect(text).toContain('*Material:* PET Resin');
      expect(text).toContain('Price Exceeded Threshold');
      expect(text).toContain('INR 110.00 / kg');
      expect(text).toContain('INR 100.00 / kg (ABSOLUTE)');
      expect(text).toContain('+10.00%');
      expect(text).toContain('2026-11-14 10:00:00 UTC');
    });

    test('formatAlertMessage formats percentage condition cleanly', () => {
      const text = whatsappProvider.formatAlertMessage({
        materialName: 'Corrugated Box',
        conditionType: 'PRICE_BELOW',
        thresholdType: 'PERCENTAGE',
        thresholdPrice: 5.5,
        triggeredPrice: 92,
        triggeredChangePercent: -8,
        currency: 'INR',
        unitLabel: 'piece',
      });

      expect(text).toContain('*Material:* Corrugated Box');
      expect(text).toContain('Price Dropped Below Threshold');
      expect(text).toContain('5.5% (PERCENTAGE)');
      expect(text).toContain('-8.00%');
    });
  });

  describe('Outbound Delivery (sendMessage)', () => {
    const originalWhatsapp = { ...env.whatsapp };
    const originalFetch = global.fetch;

    afterEach(() => {
      env.whatsapp = { ...originalWhatsapp };
      global.fetch = originalFetch;
    });

    test('returns disabled error when WHATSAPP_ENABLED is false', async () => {
      env.whatsapp.enabled = false;

      const res = await whatsappProvider.sendMessage({
        to: '+919876543210',
        text: 'Test alert message',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('disabled');
    });

    test('returns invalid phone error when phone is not valid E.164', async () => {
      env.whatsapp.enabled = true;
      env.whatsapp.apiToken = 'test_token';
      env.whatsapp.phoneNumberId = '123456';

      const res = await whatsappProvider.sendMessage({
        to: '9876543210',
        text: 'Test alert message',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid destination phone number');
    });

    test('returns misconfigured error when credentials are unset', async () => {
      env.whatsapp.enabled = true;
      env.whatsapp.apiToken = undefined;
      env.whatsapp.phoneNumberId = undefined;

      const res = await whatsappProvider.sendMessage({
        to: '+919876543210',
        text: 'Test alert message',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('misconfigured');
    });

    test('successfully dispatches message via Meta Cloud API POST', async () => {
      env.whatsapp.enabled = true;
      env.whatsapp.apiToken = 'mock_api_token';
      env.whatsapp.phoneNumberId = '1000999';
      env.whatsapp.baseUrl = 'https://graph.facebook.com/v20.0';

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '919876543210', wa_id: '919876543210' }],
          messages: [{ id: 'wamid.HBgNNzg5' }],
        }),
      });

      const res = await whatsappProvider.sendMessage({
        to: '+919876543210',
        text: 'Test alert message',
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toBe('wamid.HBgNNzg5');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v20.0/1000999/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock_api_token',
          }),
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: '919876543210',
            type: 'text',
            text: {
              preview_url: false,
              body: 'Test alert message',
            },
          }),
        })
      );
    });

    test('handles API HTTP error gracefully without throwing', async () => {
      env.whatsapp.enabled = true;
      env.whatsapp.apiToken = 'mock_api_token';
      env.whatsapp.phoneNumberId = '1000999';

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: {
            message: 'Recipient phone number not in allowed test whitelist',
            type: 'OAuthException',
            code: 131030,
          },
        }),
      });

      const res = await whatsappProvider.sendMessage({
        to: '+919876543210',
        text: 'Test alert message',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Recipient phone number not in allowed test whitelist');
    });

    test('handles request timeout gracefully', async () => {
      env.whatsapp.enabled = true;
      env.whatsapp.apiToken = 'mock_api_token';
      env.whatsapp.phoneNumberId = '1000999';
      env.whatsapp.timeoutMs = 100;

      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      global.fetch = jest.fn().mockRejectedValue(abortErr);

      const res = await whatsappProvider.sendMessage({
        to: '+919876543210',
        text: 'Test alert message',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('timed out');
    });
  });
});
