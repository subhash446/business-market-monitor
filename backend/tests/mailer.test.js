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
      const updateTriggeredSpy = jest.spyOn(alertRuleRepository, 'claimTriggerCooldown').mockResolvedValue(true);

      const sendEmailSpy = jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ id: 're_sent_123' });

      const evaluated = await alertEvaluationService.evaluateMaterial(1, 5);

      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(updateStatusSpy).toHaveBeenCalledWith(501, 'SENT');
      expect(evaluated).toHaveLength(1);
      expect(evaluated[0].delivery_status).toBe('SENT');

      sendEmailSpy.mockRestore();
      updateTriggeredSpy.mockRestore();
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
      const updateTriggeredSpy = jest.spyOn(alertRuleRepository, 'claimTriggerCooldown').mockResolvedValue(true);

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
      updateTriggeredSpy.mockRestore();
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

  describe('buildAlertNotification() HTML escaping & date safety (T-01.1)', () => {
    const { buildAlertNotification } = require('../src/email/templates/alertNotification.template');

    test('escapes HTML-sensitive characters in materialName and unitSuffix once without double-escaping', () => {
      const maliciousMaterial = '<script>alert("xss")</script> & \'PET\'';
      const maliciousUnit = 'kg <img src=x onerror="alert(1)"> & \'unit\'';

      const { subject, html } = buildAlertNotification({
        materialName: maliciousMaterial,
        conditionType: 'PRICE_ABOVE',
        thresholdType: 'ABSOLUTE',
        thresholdPrice: 120,
        triggeredPrice: 135.75,
        currency: 'INR',
        unitLabel: maliciousUnit,
        triggeredAt: '2026-11-11T10:30:00Z',
      });

      // Raw HTML tags must never appear in HTML body
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img src=x');

      // Escaped values must appear once (no double escaping like &amp;lt; or &amp;amp;)
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;PET&#39;');
      expect(html).toContain(' / kg &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;unit&#39;');
      expect(html).not.toContain('&amp;lt;');
      expect(html).not.toContain('&amp;amp;');

      // Plain-text email subject should preserve readable text without HTML entities
      expect(subject).toContain('Price Alert: <script>alert("xss")</script> & \'PET\'');
    });

    test('formats valid Date and ISO triggeredAt strings into ISO-8601 UTC output', () => {
      const fromIso = buildAlertNotification({
        materialName: 'Wheat',
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: 2500,
        triggeredPrice: 2650,
        triggeredAt: '2026-09-18T10:00:00Z',
      });
      expect(fromIso.html).toContain('2026-09-18T10:00:00.000Z');

      const fromDateObj = buildAlertNotification({
        materialName: 'Sugar',
        conditionType: 'PRICE_BELOW',
        thresholdPrice: 4000,
        triggeredPrice: 3900,
        triggeredAt: new Date('2026-10-01T12:15:30Z'),
      });
      expect(fromDateObj.html).toContain('2026-10-01T12:15:30.000Z');
    });

    test('handles null, undefined, and invalid triggeredAt dates safely without RangeError or 1970 fallback', () => {
      for (const badDate of [null, undefined, '', 'not-a-date', new Date('invalid'), {}, true]) {
        expect(() => buildAlertNotification({
          materialName: 'HDPE Granules',
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: 100,
          triggeredPrice: 110,
          triggeredAt: badDate,
        })).not.toThrow();

        const res = buildAlertNotification({
          materialName: 'HDPE Granules',
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: 100,
          triggeredPrice: 110,
          triggeredAt: badDate,
        });
        expect(res.html).toContain('>N/A<');
        expect(res.html).not.toContain('1970-01-01');
      }
    });

    test('handles null, undefined, and unexpected types for materialName, unitLabel, currency, and numeric fields safely', () => {
      const res = buildAlertNotification({
        materialName: { unexpected: true },
        conditionType: 'PRICE_ABOVE',
        thresholdType: 'PERCENTAGE',
        thresholdPrice: null,
        triggeredPrice: undefined,
        triggeredChangePercent: 'not-a-number',
        currency: 'USD<script>',
        unitLabel: { bad: 1 },
        triggeredAt: null,
      });

      expect(res.html).toContain('Tracked Material');
      expect(res.html).not.toContain('[object Object]');
      expect(res.html).not.toContain('<script>');
      expect(res.html).toContain('USD&lt;script&gt;');
      expect(res.html).toContain('>N/A<');
      expect(() => buildAlertNotification()).not.toThrow();
    });
  });

  describe('Brevo Transactional Email Provider (src/email/mailer.js)', () => {
    const originalFetch = global.fetch;
    const originalEnvEmail = { ...env.email };
    const originalEnvBrevo = { ...env.brevo };

    beforeEach(() => {
      jest.clearAllMocks();
      env.email = { ...originalEnvEmail, provider: '', from: '' };
      env.brevo = {
        ...originalEnvBrevo,
        apiKey: '',
        baseUrl: 'https://api.brevo.com/v3',
        fromEmail: '',
      };
    });

    afterEach(() => {
      global.fetch = originalFetch;
      env.email = { ...originalEnvEmail };
      env.brevo = { ...originalEnvBrevo };
    });

    test('1. provider selection precedence respects explicit EMAIL_PROVIDER, auto-detects BREVO_API_KEY, and preserves Resend default', () => {
      // Unset provider + unset BREVO_API_KEY -> resend
      env.email.provider = '';
      env.brevo.apiKey = '';
      expect(mailer.resolveEmailProvider()).toBe('resend');

      // Unset provider + BREVO_API_KEY set -> auto-select brevo
      env.brevo.apiKey = 'xkeysib-auto-select-123';
      expect(mailer.resolveEmailProvider()).toBe('brevo');

      // Explicit EMAIL_PROVIDER='resend' overrides BREVO_API_KEY
      env.email.provider = 'resend';
      expect(mailer.resolveEmailProvider()).toBe('resend');

      // Explicit EMAIL_PROVIDER='brevo' selects brevo
      env.email.provider = 'brevo';
      expect(mailer.resolveEmailProvider()).toBe('brevo');

      // Explicit EMAIL_PROVIDER='console' selects console
      env.email.provider = 'console';
      expect(mailer.resolveEmailProvider()).toBe('console');
    });

    test('2. parseBrevoSender formats "Display Name <email>" and plain email with default name', () => {
      expect(mailer.parseBrevoSender('Business Market Monitor <alerts@bmm.example.com>')).toEqual({
        name: 'Business Market Monitor',
        email: 'alerts@bmm.example.com',
      });

      expect(mailer.parseBrevoSender('"Custom Procurement Team" <team@factory.in>')).toEqual({
        name: 'Custom Procurement Team',
        email: 'team@factory.in',
      });

      expect(mailer.parseBrevoSender('noreply@bmm.example.com')).toEqual({
        name: 'Business Market Monitor',
        email: 'noreply@bmm.example.com',
      });

      expect(() => mailer.parseBrevoSender('')).toThrow('EMAIL_FROM is not configured');
      expect(() => mailer.parseBrevoSender('not-an-email')).toThrow('EMAIL_FROM must be a valid email address');
    });

    test('3. sends via Brevo REST API with parsed sender and returns { provider: "brevo", messageId } on 201', async () => {
      env.email.provider = 'brevo';
      env.email.from = 'Business Market Monitor <noreply@bmm.example.com>';
      env.brevo.apiKey = 'xkeysib-secret-test-key-999';

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: jest.fn().mockResolvedValue(JSON.stringify({ messageId: '<20261126.brevo-msg-001@smtp-relay.mailin.fr>' })),
      });

      const result = await mailer.sendEmail({
        to: 'buyer@packaging.in',
        subject: 'Your Business Market Monitor verification code: 482910',
        html: '<p>Code: <strong>482910</strong></p>',
        text: 'Code: 482910',
      });

      expect(result).toEqual({
        provider: 'brevo',
        messageId: '<20261126.brevo-msg-001@smtp-relay.mailin.fr>',
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({
        'api-key': 'xkeysib-secret-test-key-999',
        'content-type': 'application/json',
        accept: 'application/json',
      });
      expect(options.signal).toBeDefined();

      const body = JSON.parse(options.body);
      expect(body).toEqual({
        sender: { name: 'Business Market Monitor', email: 'noreply@bmm.example.com' },
        to: [{ email: 'buyer@packaging.in' }],
        subject: 'Your Business Market Monitor verification code: 482910',
        htmlContent: '<p>Code: <strong>482910</strong></p>',
        textContent: 'Code: 482910',
      });
    });

    test('4. automatically selects Brevo when EMAIL_PROVIDER is unset and BREVO_API_KEY is set, using default sender name for plain EMAIL_FROM', async () => {
      env.email.provider = '';
      env.email.from = 'otp@bmm.example.com';
      env.brevo.apiKey = 'xkeysib-auto-key-777';

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: jest.fn().mockResolvedValue(JSON.stringify({ messageId: '<msg-plain-sender>' })),
      });

      const result = await mailer.sendEmail({
        to: 'owner@factory.com',
        subject: 'Reset Password',
        html: '<p>Reset link</p>',
      });

      expect(result).toEqual({ provider: 'brevo', messageId: '<msg-plain-sender>' });
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.sender).toEqual({ name: 'Business Market Monitor', email: 'otp@bmm.example.com' });
      expect(body.textContent).toBeUndefined();
    });

    test('5. throws sanitized error (redacting BREVO_API_KEY) on non-2xx Brevo API response and never logs key', async () => {
      env.email.provider = 'brevo';
      env.email.from = 'noreply@bmm.example.com';
      env.brevo.apiKey = 'xkeysib-top-secret-key-12345';

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            code: 'unauthorized',
            message: 'Key xkeysib-top-secret-key-12345 is invalid',
          })
        ),
      });

      await expect(
        mailer.sendEmail({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Brevo email delivery failed (401): Key [REDACTED_API_KEY] is invalid');

      const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String);
      expect(logged.some((line) => line.includes('xkeysib-top-secret-key-12345'))).toBe(false);

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    test('6. throws clear timeout error on AbortError and actionable error if BREVO_API_KEY missing', async () => {
      env.email.provider = 'brevo';
      env.email.from = 'noreply@bmm.example.com';
      env.brevo.apiKey = '';

      await expect(
        mailer.sendEmail({ to: 'user@example.com', subject: 'Test', html: '<p>Test</p>' })
      ).rejects.toThrow('BREVO_API_KEY is not configured');

      env.brevo.apiKey = 'xkeysib-timeout-key';
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      global.fetch = jest.fn().mockRejectedValue(abortErr);

      await expect(
        mailer.sendEmail({ to: 'user@example.com', subject: 'Test', html: '<p>Test</p>' })
      ).rejects.toThrow(/Brevo email delivery timed out/);
    });

    test('7. verifyConnection() verifies Brevo account connectivity and console mode returns cleanly', async () => {
      env.email.provider = 'brevo';
      env.email.from = 'noreply@bmm.example.com';
      env.brevo.apiKey = 'xkeysib-verify-key';

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('{"email":"noreply@bmm.example.com"}'),
      });

      await expect(mailer.verifyConnection()).resolves.toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/account',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'api-key': 'xkeysib-verify-key' }),
        })
      );

      // Console provider check
      env.email.provider = 'console';
      const logger = require('../src/utils/logger');
      const loggerSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
      const consoleRes = await mailer.sendEmail({
        to: 'user@company.com',
        subject: 'Console Notice',
        html: '<p>Hello</p>',
      });
      expect(consoleRes.provider).toBe('console');
      expect(consoleRes.messageId).toMatch(/^console-/);
      await expect(mailer.verifyConnection()).resolves.toBe(true);
      loggerSpy.mockRestore();
    });
  });
});

