'use strict';

/**
 * Unit & Integration tests for Periodic News Digest (FR-ALERT-06 / T-08).
 */

const newsDigestService = require('../src/services/newsDigest.service');
const { buildNewsDigest } = require('../src/email/templates/newsDigest.template');
const { formatNewsDigestMessage } = require('../src/providers/whatsapp.provider');
const notificationService = require('../src/services/notification.service');
const newsDigestJob = require('../src/jobs/newsDigest.job');
const mailer = require('../src/email/mailer');
const whatsappProvider = require('../src/providers/whatsapp.provider');
const businessRepository = require('../src/repositories/business.repository');
const materialRepository = require('../src/repositories/material.repository');
const newsRepository = require('../src/repositories/news.repository');
const syncStatusRepository = require('../src/repositories/syncStatus.repository');
const { pool } = require('../src/database/connection');
const env = require('../src/config/env');

describe('Periodic News Digest Service & Templates (T-08 / FR-ALERT-06)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('isBusinessDueForDigest Cadence Checks', () => {
    const now = new Date('2026-11-14T12:00:00Z');

    test('returns false when news_digest_enabled is false', () => {
      const biz = { news_digest_enabled: false, last_digest_sent_at: null };
      expect(newsDigestService.isBusinessDueForDigest(biz, now)).toBe(false);
    });

    test('returns true when last_digest_sent_at is null (never sent)', () => {
      const biz = { news_digest_enabled: true, news_digest_frequency: 'WEEKLY', last_digest_sent_at: null };
      expect(newsDigestService.isBusinessDueForDigest(biz, now)).toBe(true);
    });

    test('evaluates DAILY cadence (>= 20 hours)', () => {
      // 19 hours ago -> not due
      const sent19h = new Date(now.getTime() - 19 * 60 * 60 * 1000);
      expect(newsDigestService.isBusinessDueForDigest({
        news_digest_enabled: true,
        news_digest_frequency: 'DAILY',
        last_digest_sent_at: sent19h,
      }, now)).toBe(false);

      // 21 hours ago -> due
      const sent21h = new Date(now.getTime() - 21 * 60 * 60 * 1000);
      expect(newsDigestService.isBusinessDueForDigest({
        news_digest_enabled: true,
        news_digest_frequency: 'DAILY',
        last_digest_sent_at: sent21h,
      }, now)).toBe(true);
    });

    test('evaluates WEEKLY cadence (>= 6 days)', () => {
      // 5 days ago -> not due
      const sent5d = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      expect(newsDigestService.isBusinessDueForDigest({
        news_digest_enabled: true,
        news_digest_frequency: 'WEEKLY',
        last_digest_sent_at: sent5d,
      }, now)).toBe(false);

      // 6.5 days ago -> due
      const sent6d = new Date(now.getTime() - 6.5 * 24 * 60 * 60 * 1000);
      expect(newsDigestService.isBusinessDueForDigest({
        news_digest_enabled: true,
        news_digest_frequency: 'WEEKLY',
        last_digest_sent_at: sent6d,
      }, now)).toBe(true);
    });

    test('evaluates MONTHLY cadence (>= 27 days)', () => {
      // 25 days ago -> not due
      const sent25d = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000);
      expect(newsDigestService.isBusinessDueForDigest({
        news_digest_enabled: true,
        news_digest_frequency: 'MONTHLY',
        last_digest_sent_at: sent25d,
      }, now)).toBe(false);

      // 28 days ago -> due
      const sent28d = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      expect(newsDigestService.isBusinessDueForDigest({
        news_digest_enabled: true,
        news_digest_frequency: 'MONTHLY',
        last_digest_sent_at: sent28d,
      }, now)).toBe(true);
    });
  });

  describe('Email & WhatsApp Digest Templates', () => {
    const samplePayload = {
      businessName: 'Apex Polychem Ltd <script>',
      industryName: 'Plastics & Polymers',
      frequency: 'WEEKLY',
      topMovers: [
        {
          materialName: 'PET Resin Bottle Grade',
          latestPrice: 115.50,
          changePercent: 6.25,
          trend: 'UP',
          currency: 'INR',
          unit: 'kg',
        },
      ],
      topNews: [
        {
          id: 1,
          title: 'Crude rallies as global refining capacity tightens',
          url: 'https://example.com/news/1',
          sourceName: 'Reuters',
          publishedAt: '2026-11-13T08:00:00Z',
        },
      ],
      procurementActions: [
        {
          materialName: 'PET Resin Bottle Grade',
          actionRecommendation: 'ACCELERATE_PURCHASE',
          rationale: 'Domestic price rally expected to persist.',
        },
      ],
    };

    test('buildNewsDigest generates sanitized HTML, subject, and text fallback', () => {
      const { subject, html, text } = buildNewsDigest(samplePayload);

      expect(subject).toContain('[Weekly Digest]');
      expect(subject).toContain('Apex Polychem Ltd');

      // Check HTML escaping
      expect(html).not.toContain('<script>');
      expect(html).toContain('Apex Polychem Ltd &lt;script&gt;');
      expect(html).toContain('PET Resin Bottle Grade');
      expect(html).toContain('+6.25%');
      expect(html).toContain('ACCELERATE PURCHASE');
      expect(html).toContain('Crude rallies as global refining capacity tightens');

      // Check plain text representation
      expect(text).toContain('=== BUSINESS MARKET MONITOR — WEEKLY DIGEST ===');
      expect(text).toContain('• PET Resin Bottle Grade: INR 115.50 (+6.25%) [UP]');
      expect(text).toContain('• PET Resin Bottle Grade [ACCELERATE PURCHASE]');
    });

    test('formatNewsDigestMessage formats structured WhatsApp chat message', () => {
      const waText = formatNewsDigestMessage(samplePayload);

      expect(waText).toContain('📰 *Business Market Monitor — Weekly Digest*');
      expect(waText).toContain('*Apex Polychem Ltd <script>*');
      expect(waText).toContain('📊 *7-Day Price Movers:*');
      expect(waText).toContain('• *PET Resin Bottle Grade*: INR 115.50/kg (+6.3%) [UP]');
      expect(waText).toContain('🎯 *Sourcing Actions:*');
      expect(waText).toContain('• *PET Resin Bottle Grade*: ACCELERATE PURCHASE');
      expect(waText).toContain('🗞️ *Industry Headlines:*');
    });
  });

  describe('notificationService.sendNewsDigestNotification', () => {
    test('routes to Resend mailer when channel is EMAIL', async () => {
      const sendEmailSpy = jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ id: 'msg_email_123' });
      const sendWaSpy = jest.spyOn(whatsappProvider, 'sendMessage').mockResolvedValue({ success: true });

      const res = await notificationService.sendNewsDigestNotification({
        channel: 'EMAIL',
        toEmail: 'procurement@apex.com',
        businessName: 'Apex Ltd',
        industryName: 'Packaging',
      });

      expect(res.success).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendWaSpy).not.toHaveBeenCalled();
      expect(res.results.email.id).toBe('msg_email_123');
    });

    test('routes to WhatsApp provider when channel is WHATSAPP', async () => {
      const sendEmailSpy = jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ id: 'msg_email_123' });
      const sendWaSpy = jest.spyOn(whatsappProvider, 'sendMessage').mockResolvedValue({
        success: true,
        messageId: 'wamid.123',
      });

      const res = await notificationService.sendNewsDigestNotification({
        channel: 'WHATSAPP',
        toPhone: '+919876543210',
        businessName: 'Apex Ltd',
        industryName: 'Packaging',
      });

      expect(res.success).toBe(true);
      expect(sendEmailSpy).not.toHaveBeenCalled();
      expect(sendWaSpy).toHaveBeenCalledTimes(1);
      expect(res.results.whatsapp.messageId).toBe('wamid.123');
    });

    test('routes to BOTH email and WhatsApp when channel is BOTH', async () => {
      jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ id: 'msg_email_123' });
      jest.spyOn(whatsappProvider, 'sendMessage').mockResolvedValue({ success: true, messageId: 'wamid.123' });

      const res = await notificationService.sendNewsDigestNotification({
        channel: 'BOTH',
        toEmail: 'procurement@apex.com',
        toPhone: '+919876543210',
        businessName: 'Apex Ltd',
        industryName: 'Packaging',
      });

      expect(res.success).toBe(true);
      expect(res.results.email.success).toBe(true);
      expect(res.results.whatsapp.success).toBe(true);
    });
  });

  describe('generateDigestForBusiness & sendDigestForBusiness', () => {
    test('generateDigestForBusiness returns cohesive business intelligence payload', async () => {
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({
        id: 1,
        user_id: 10,
        industry_id: 2,
        name: 'Alpha Plastics',
        industry_name: 'Polymers',
        contact_email: 'alpha@example.com',
        contact_phone: '+919876543210',
        news_digest_channel: 'EMAIL',
        news_digest_frequency: 'WEEKLY',
        last_digest_sent_at: null,
      });

      jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([
        { id: 36, name: 'PET Resin', unit_abbreviation: 'INR/kg', is_tracked: 1 },
      ]);

      jest.spyOn(newsRepository, 'listByIndustry').mockResolvedValue([
        { id: 1, title: 'Polymer news', url: 'https://example.com', source_name: 'Reuters', published_at: new Date() },
      ]);

      jest.spyOn(pool, 'execute').mockImplementation(async (sql) => {
        if (sql.includes('price_points')) {
          return [[
            { price: 110.00, recorded_at: '2026-11-14T00:00:00Z', currency: 'INR', unit_label: 'kg' },
            { price: 100.00, recorded_at: '2026-11-07T00:00:00Z', currency: 'INR', unit_label: 'kg' },
          ]];
        }
        return [[]];
      });

      const digest = await newsDigestService.generateDigestForBusiness(1);

      expect(digest.businessId).toBe(1);
      expect(digest.businessName).toBe('Alpha Plastics');
      expect(digest.topMovers.length).toBe(1);
      expect(digest.topMovers[0].changePercent).toBe(10.00);
      expect(digest.topMovers[0].trend).toBe('UP');
      expect(digest.topNews.length).toBe(1);
      expect(digest.summary.totalTrackedMaterials).toBe(1);
    });

    test('sendDigestForBusiness dispatches notification and updates last_digest_sent_at', async () => {
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({
        id: 1,
        user_id: 10,
        industry_id: 2,
        name: 'Alpha Plastics',
        industry_name: 'Polymers',
        contact_email: 'alpha@example.com',
        contact_phone: '+919876543210',
        news_digest_channel: 'EMAIL',
        news_digest_frequency: 'WEEKLY',
      });

      jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([]);
      jest.spyOn(newsRepository, 'listByIndustry').mockResolvedValue([]);
      jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      const updateLastSpy = jest.spyOn(businessRepository, 'updateLastDigestSentAt').mockResolvedValue(true);
      jest.spyOn(notificationService, 'sendNewsDigestNotification').mockResolvedValue({
        success: true,
        results: { email: { success: true } },
      });

      const outcome = await newsDigestService.sendDigestForBusiness(1);

      expect(outcome.success).toBe(true);
      expect(updateLastSpy).toHaveBeenCalledTimes(1);
      expect(outcome.channelUsed).toBe('EMAIL');
    });
  });

  describe('newsDigestJob', () => {
    test('skips execution cleanly when NEWS_DIGEST_ENABLED=false', async () => {
      env.newsDigest.enabled = false;
      const res = await newsDigestJob.runJob();
      expect(res.status).toBe('SKIPPED');
      expect(res.reason).toBe('disabled');
    });

    test('executes batch and writes to sync_statuses when enabled', async () => {
      env.newsDigest.enabled = true;
      const upsertSpy = jest.spyOn(syncStatusRepository, 'upsert').mockResolvedValue();
      jest.spyOn(newsDigestService, 'processAllDueDigests').mockResolvedValue({
        totalEvaluated: 5,
        dueCount: 2,
        successCount: 2,
        failedCount: 0,
        skippedCount: 3,
        errors: [],
      });

      const res = await newsDigestJob.runJob();

      expect(res.status).toBe('SUCCESS');
      expect(res.successCount).toBe(2);
      expect(upsertSpy).toHaveBeenCalledTimes(2); // start and finish
      env.newsDigest.enabled = false; // restore safe default
    });
  });
});
