const env = require('../src/config/env');
const mailer = require('../src/email/mailer');
const notificationService = require('../src/services/notification.service');

// Mock external dependencies
jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation((apiKey) => {
      if (!apiKey || String(apiKey).trim() === '') {
        throw new Error('Missing API key. Pass it to the constructor `new Resend("re_123")`');
      }
      return {
        key: apiKey,
        emails: {
          send: jest.fn(),
        },
        apiKeys: {
          list: jest.fn(),
        },
      };
    }),
  };
});

describe('Resend Mailer Provider (src/email/mailer.js)', () => {
  const originalEnvResend = { ...env.resend };

  beforeEach(() => {
    jest.clearAllMocks();
    env.resend = {
      ...originalEnvResend,
      apiKey: 're_test_123456789',
      fromEmail: 'onboarding@resend.dev',
    };
  });

  afterAll(() => {
    env.resend = originalEnvResend;
  });

  describe('sendEmail()', () => {
    test('1. successfully sends an email via Resend API and returns delivery data', async () => {
      const mockClient = {
        emails: {
          send: jest.fn().mockResolvedValue({
            data: { id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' },
            error: null,
          }),
        },
      };

      const result = await mailer.sendEmail(
        {
          to: 'client@example.com',
          subject: 'Price Alert: Crude Oil Above ₹6500',
          html: '<p>Alert triggered!</p>',
        },
        mockClient
      );

      expect(mockClient.emails.send).toHaveBeenCalledTimes(1);
      expect(mockClient.emails.send).toHaveBeenCalledWith({
        from: 'onboarding@resend.dev',
        to: 'client@example.com',
        subject: 'Price Alert: Crude Oil Above ₹6500',
        html: '<p>Alert triggered!</p>',
      });
      expect(result).toEqual({ id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' });
    });

    test('2. throws an informative error when Resend API returns an error response', async () => {
      const mockClient = {
        emails: {
          send: jest.fn().mockResolvedValue({
            data: null,
            error: {
              statusCode: 403,
              name: 'validation_error',
              message: 'Domain not verified. Please verify your domain in Resend.',
            },
          }),
        },
      };

      await expect(
        mailer.sendEmail(
          {
            to: 'client@example.com',
            subject: 'Test Subject',
            html: '<p>Test</p>',
          },
          mockClient
        )
      ).rejects.toThrow('Resend email delivery failed: Domain not verified. Please verify your domain in Resend.');
    });

    test('3. propagates network or unexpected rejections from the client', async () => {
      const mockClient = {
        emails: {
          send: jest.fn().mockRejectedValue(new Error('ETIMEDOUT connecting to api.resend.com:443')),
        },
      };

      await expect(
        mailer.sendEmail(
          {
            to: 'client@example.com',
            subject: 'Test Subject',
            html: '<p>Test</p>',
          },
          mockClient
        )
      ).rejects.toThrow('ETIMEDOUT connecting to api.resend.com:443');
    });

    test('4. throws actionable error when RESEND_API_KEY is missing', async () => {
      env.resend.apiKey = '';

      await expect(
        mailer.sendEmail({
          to: 'client@example.com',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('RESEND_API_KEY is not configured');
    });

    test('5. throws actionable error when RESEND_FROM_EMAIL is missing', async () => {
      env.resend.fromEmail = '';

      await expect(
        mailer.sendEmail({
          to: 'client@example.com',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('RESEND_FROM_EMAIL is not configured');
    });

    test('6. throws actionable error when recipient "to" is missing or empty', async () => {
      await expect(
        mailer.sendEmail({
          to: '',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Recipient email ("to") is required');

      await expect(
        mailer.sendEmail({
          to: [],
          subject: 'Test Subject',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Recipient email ("to") is required');
    });
  });

  describe('verifyConnection()', () => {
    test('1. returns true when credentials are valid and apiKeys.list returns no error', async () => {
      const mockClient = {
        apiKeys: {
          list: jest.fn().mockResolvedValue({
            data: [{ id: 'key_1' }],
            error: null,
          }),
        },
      };

      const result = await mailer.verifyConnection(mockClient);
      expect(result).toBe(true);
      expect(mockClient.apiKeys.list).toHaveBeenCalledTimes(1);
    });

    test('2. returns true when apiKeys.list returns 403 restricted key (sending-only key)', async () => {
      const mockClient = {
        apiKeys: {
          list: jest.fn().mockResolvedValue({
            data: null,
            error: {
              statusCode: 403,
              name: 'restricted_api_key',
              message: 'You do not have permission to access this resource',
            },
          }),
        },
      };

      const result = await mailer.verifyConnection(mockClient);
      expect(result).toBe(true);
    });

    test('3. throws error when apiKeys.list returns an invalid API key error', async () => {
      const mockClient = {
        apiKeys: {
          list: jest.fn().mockResolvedValue({
            data: null,
            error: {
              statusCode: 401,
              name: 'validation_error',
              message: 'API key is invalid',
            },
          }),
        },
      };

      await expect(mailer.verifyConnection(mockClient)).rejects.toThrow(
        'Resend connection verification failed: API key is invalid'
      );
    });

    test('4. throws actionable error when RESEND_API_KEY is missing during verification', async () => {
      env.resend.apiKey = '';

      await expect(mailer.verifyConnection()).rejects.toThrow('RESEND_API_KEY is not configured');
    });

    test('5. throws actionable error when RESEND_FROM_EMAIL is missing during verification', async () => {
      env.resend.fromEmail = '';

      await expect(mailer.verifyConnection()).rejects.toThrow('RESEND_FROM_EMAIL is not configured');
    });
  });

  describe('NotificationService integration', () => {
    test('sendAlertNotification() formats template and invokes mailer.sendEmail()', async () => {
      const sendEmailSpy = jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ id: 'resend-evt-123' });

      const result = await notificationService.sendAlertNotification({
        to: 'buyer@industrial.com',
        materialName: 'Polypropylene',
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: 120,
        triggeredPrice: 125.5,
        triggeredAt: '2026-09-18T10:00:00Z',
      });

      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      const callArg = sendEmailSpy.mock.calls[0][0];
      expect(callArg.to).toBe('buyer@industrial.com');
      expect(callArg.subject).toContain('Price Alert: Polypropylene Price Above ₹120.00');
      expect(callArg.html).toContain('Polypropylene');
      expect(callArg.html).toContain('₹125.50');
      expect(result).toEqual({ id: 'resend-evt-123' });

      sendEmailSpy.mockRestore();
    });

    test('verifyEmailConnection() delegates to mailer.verifyConnection()', async () => {
      const verifySpy = jest.spyOn(mailer, 'verifyConnection').mockResolvedValue(true);

      const result = await notificationService.verifyEmailConnection();
      expect(result).toBe(true);
      expect(verifySpy).toHaveBeenCalledTimes(1);

      verifySpy.mockRestore();
    });
  });

  describe('Alert delivery status handling (SENT vs FAILED)', () => {
    test('alert evaluation marks event as SENT when email delivery succeeds', async () => {
      const alertEventRepository = require('../src/repositories/alertEvent.repository');
      const alertRuleRepository = require('../src/repositories/alertRule.repository');
      const priceRepository = require('../src/repositories/price.repository');
      const materialRepository = require('../src/repositories/material.repository');
      const businessRepository = require('../src/repositories/business.repository');
      const userRepository = require('../src/repositories/user.repository');
      const alertEvaluationService = require('../src/services/alertEvaluation.service');

      // Mock dependencies
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 99,
        tracked_material_id: 5,
        price: '110.00',
        recorded_at: '2026-09-18',
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 10,
          business_id: 1,
          tracked_material_id: 5,
          condition_type: 'PRICE_ABOVE',
          threshold_price: '100.00',
          notification_channel: 'EMAIL',
        },
      ]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 5,
        name: 'Copper Cathode',
      });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({
        id: 1,
        user_id: 42,
      });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({
        id: 42,
        email: 'recipient@example.com',
      });
      jest.spyOn(alertEventRepository, 'create').mockResolvedValue({
        id: 501,
        alert_rule_id: 10,
        business_id: 1,
        tracked_material_id: 5,
        triggered_at: '2026-09-18T10:00:00Z',
      });
      const updateStatusSpy = jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValue(true);

      const sendEmailSpy = jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ id: 're_sent_123' });

      const evaluated = await alertEvaluationService.evaluateMaterial(1, 5);

      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(updateStatusSpy).toHaveBeenCalledWith(501, 'SENT');
      expect(evaluated).toHaveLength(1);
      expect(evaluated[0].delivery_status).toBe('SENT');

      sendEmailSpy.mockRestore();
      updateStatusSpy.mockRestore();
      alertEventRepository.create.mockRestore();
      userRepository.findById.mockRestore();
      businessRepository.findById.mockRestore();
      materialRepository.findByIdForBusiness.mockRestore();
      alertRuleRepository.listActiveByBusinessId.mockRestore();
      priceRepository.findLatestByMaterialId.mockRestore();
    });

    test('alert evaluation marks event as FAILED when email delivery fails', async () => {
      const alertEventRepository = require('../src/repositories/alertEvent.repository');
      const alertRuleRepository = require('../src/repositories/alertRule.repository');
      const priceRepository = require('../src/repositories/price.repository');
      const materialRepository = require('../src/repositories/material.repository');
      const businessRepository = require('../src/repositories/business.repository');
      const userRepository = require('../src/repositories/user.repository');
      const alertEvaluationService = require('../src/services/alertEvaluation.service');

      // Mock dependencies
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 100,
        tracked_material_id: 6,
        price: '40.00',
        recorded_at: '2026-09-18',
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 11,
          business_id: 1,
          tracked_material_id: 6,
          condition_type: 'PRICE_BELOW',
          threshold_price: '50.00',
          notification_channel: 'EMAIL',
        },
      ]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 6,
        name: 'Aluminum Ingot',
      });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({
        id: 1,
        user_id: 42,
      });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({
        id: 42,
        email: 'recipient@example.com',
      });
      jest.spyOn(alertEventRepository, 'create').mockResolvedValue({
        id: 502,
        alert_rule_id: 11,
        business_id: 1,
        tracked_material_id: 6,
        triggered_at: '2026-09-18T10:00:00Z',
      });
      const updateStatusSpy = jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValue(true);

      const sendEmailSpy = jest.spyOn(mailer, 'sendEmail').mockRejectedValue(
        new Error('Resend email delivery failed: API key is invalid')
      );

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const evaluated = await alertEvaluationService.evaluateMaterial(1, 6);

      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(updateStatusSpy).toHaveBeenCalledWith(502, 'FAILED');
      expect(evaluated).toHaveLength(1);
      expect(evaluated[0].delivery_status).toBe('FAILED');

      consoleErrorSpy.mockRestore();
      sendEmailSpy.mockRestore();
      updateStatusSpy.mockRestore();
      alertEventRepository.create.mockRestore();
      userRepository.findById.mockRestore();
      businessRepository.findById.mockRestore();
      materialRepository.findByIdForBusiness.mockRestore();
      alertRuleRepository.listActiveByBusinessId.mockRestore();
      priceRepository.findLatestByMaterialId.mockRestore();
    });
  });

  describe('Security and privacy checks', () => {
    test('RESEND_API_KEY and email body with sensitive tokens are never logged', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const secretToken = 'secret-password-reset-token-xyz-12345';
      const sensitiveHtml = `<p>Reset token: ${secretToken}</p>`;

      const mockClient = {
        emails: {
          send: jest.fn().mockResolvedValue({
            data: { id: 'msg-sec-1' },
            error: null,
          }),
        },
      };

      await mailer.sendEmail(
        {
          to: 'user@example.com',
          subject: 'Password Reset',
          html: sensitiveHtml,
        },
        mockClient
      );

      const allCalls = [
        ...logSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ].flat().map(String);

      expect(allCalls.some(call => call.includes('re_test_123456789'))).toBe(false);
      expect(allCalls.some(call => call.includes(secretToken))).toBe(false);

      logSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('error messages sanitize/redact any leaked API key', async () => {
      const mockClient = {
        emails: {
          send: jest.fn().mockResolvedValue({
            data: null,
            error: {
              message: 'Failed with key re_test_123456789: access denied',
            },
          }),
        },
      };

      await expect(
        mailer.sendEmail(
          {
            to: 'user@example.com',
            subject: 'Test',
            html: '<p>Test</p>',
          },
          mockClient
        )
      ).rejects.toThrow('Resend email delivery failed: Failed with key [REDACTED_API_KEY]: access denied');
    });
  });

  describe('env.resend.validate()', () => {
    test('returns true when apiKey and fromEmail are present', () => {
      expect(env.resend.validate()).toBe(true);
    });

    test('throws actionable error when apiKey is missing', () => {
      env.resend.apiKey = '';
      expect(() => env.resend.validate()).toThrow('RESEND_API_KEY is not configured');
    });

    test('throws actionable error when fromEmail is missing', () => {
      env.resend.fromEmail = '';
      expect(() => env.resend.validate()).toThrow('RESEND_FROM_EMAIL is not configured');
    });
  });
});

