'use strict';

const mailer = require('../email/mailer');
const { buildAlertNotification } = require('../email/templates/alertNotification.template');
const { buildNewsDigest } = require('../email/templates/newsDigest.template');
const whatsappProvider = require('../providers/whatsapp.provider');

async function sendAlertNotification({
  channel = 'EMAIL',
  to,
  materialName,
  conditionType,
  thresholdType = 'ABSOLUTE',
  thresholdPrice,
  triggeredPrice,
  triggeredChangePercent = null,
  currency = 'INR',
  unitLabel = null,
  triggeredAt,
}) {
  if (channel === 'WHATSAPP') {
    const formattedText = whatsappProvider.formatAlertMessage({
      materialName,
      conditionType,
      thresholdType,
      thresholdPrice,
      triggeredPrice,
      triggeredChangePercent,
      currency,
      unitLabel,
      triggeredAt,
    });

    return whatsappProvider.sendMessage({
      to,
      text: formattedText,
    });
  }

  // Default: EMAIL channel
  const { subject, html } = buildAlertNotification({
    materialName,
    conditionType,
    thresholdType,
    thresholdPrice,
    triggeredPrice,
    triggeredChangePercent,
    currency,
    unitLabel,
    triggeredAt,
  });

  return mailer.sendEmail({
    to,
    subject,
    html,
  });
}

/**
 * Send periodic news & procurement digest notification across configured channels (EMAIL, WHATSAPP, BOTH).
 */
async function sendNewsDigestNotification({
  channel = 'EMAIL',
  toEmail = null,
  toPhone = null,
  businessName,
  industryName,
  frequency = 'WEEKLY',
  topMovers = [],
  topNews = [],
  procurementActions = [],
  generatedAt = null,
  dashboardUrl,
}) {
  const normChannel = String(channel || 'EMAIL').toUpperCase();
  const results = {
    email: null,
    whatsapp: null,
  };

  const payload = {
    businessName,
    industryName,
    frequency,
    topMovers,
    topNews,
    procurementActions,
    generatedAt,
    dashboardUrl,
  };

  if ((normChannel === 'EMAIL' || normChannel === 'BOTH') && toEmail) {
    const { subject, html, text } = buildNewsDigest(payload);
    try {
      const emailRes = await mailer.sendEmail({
        to: toEmail,
        subject,
        html,
        text,
      });
      results.email = { success: true, ...emailRes };
    } catch (err) {
      results.email = { success: false, error: err.message };
    }
  }

  if ((normChannel === 'WHATSAPP' || normChannel === 'BOTH') && toPhone) {
    const formattedText = whatsappProvider.formatNewsDigestMessage(payload);
    try {
      const waRes = await whatsappProvider.sendMessage({
        to: toPhone,
        text: formattedText,
      });
      results.whatsapp = waRes;
    } catch (err) {
      results.whatsapp = { success: false, error: err.message };
    }
  }

  const emailSuccess = results.email ? results.email.success : (normChannel === 'WHATSAPP');
  const waSuccess = results.whatsapp ? results.whatsapp.success : (normChannel === 'EMAIL');

  return {
    success: (emailSuccess || waSuccess) && (normChannel !== 'BOTH' || (emailSuccess && waSuccess)),
    results,
  };
}

async function verifyEmailConnection() {
  return mailer.verifyConnection();
}

module.exports = {
  sendAlertNotification,
  sendNewsDigestNotification,
  verifyEmailConnection,
};
