'use strict';

/**
 * WhatsApp Cloud API Provider (FR-ALERT-07 / T-06).
 *
 * Responsibilities:
 *   - Sends alert notifications via Meta WhatsApp Cloud API (Graph API v20.0+)
 *   - Enforces timeout via AbortController (no external network dependencies)
 *   - Validates recipient phone number using strict E.164 format
 *   - Strictly redacts tokens and phone numbers in error logs and returned messages
 *   - Gracefully reports delivery failure without throwing unhandled exceptions
 *   - Provider-agnostic boundary: accepts structured alert payloads and delivers
 *
 * API Reference:
 *   POST https://graph.facebook.com/v20.0/{phone_number_id}/messages
 *   Headers: Authorization: Bearer {token}, Content-Type: application/json
 */

const env = require('../config/env');

const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

function isValidE164(phone) {
  return typeof phone === 'string' && E164_PHONE_REGEX.test(phone.trim());
}

/**
 * Redact phone number for safe logging: e.g. "+919876543210" -> "+91****3210"
 */
function redactPhoneNumber(phone) {
  if (typeof phone !== 'string') return '[REDACTED]';
  const trimmed = phone.trim();
  if (trimmed.length <= 6) return '***';
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

/**
 * Sanitize error messages to eliminate tokens and full phone numbers.
 */
function sanitizeErrorMessage(err) {
  const raw = err && err.message ? String(err.message) : String(err || 'Unknown WhatsApp delivery error');
  return raw
    .replace(/(Bearer\s+)[A-Za-z0-9_.-]+/gi, '$1***')
    .replace(/\+[1-9]\d{6,14}\b/g, (m) => redactPhoneNumber(m))
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Format human-readable WhatsApp alert notification text.
 */
function formatAlertMessage({
  materialName,
  conditionType,
  thresholdType = 'ABSOLUTE',
  thresholdPrice,
  triggeredPrice,
  triggeredChangePercent = null,
  currency = 'INR',
  unitLabel = null,
  triggeredAt = null,
}) {
  const isAbove = conditionType === 'PRICE_ABOVE';
  const conditionLabel = isAbove ? 'Price Exceeded Threshold' : 'Price Dropped Below Threshold';
  const unitText = unitLabel ? ` / ${unitLabel}` : '';
  const formattedThreshold = thresholdType === 'PERCENTAGE'
    ? `${Number(thresholdPrice).toFixed(1)}%`
    : `${currency} ${Number(thresholdPrice).toFixed(2)}${unitText}`;
  const formattedTriggered = `${currency} ${Number(triggeredPrice).toFixed(2)}${unitText}`;

  let changeLine = '';
  if (triggeredChangePercent !== null && triggeredChangePercent !== undefined && Number.isFinite(Number(triggeredChangePercent))) {
    const sign = Number(triggeredChangePercent) > 0 ? '+' : '';
    changeLine = `\n• *Change:* ${sign}${Number(triggeredChangePercent).toFixed(2)}%`;
  }

  const dt = triggeredAt ? new Date(triggeredAt) : new Date();
  const timeStr = dt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    `🔔 *Business Market Monitor Alert*\n\n` +
    `*Material:* ${materialName}\n` +
    `• *Condition:* ${conditionLabel}\n` +
    `• *Triggered Price:* ${formattedTriggered}\n` +
    `• *Threshold:* ${formattedThreshold} (${thresholdType})${changeLine}\n` +
    `• *Time:* ${timeStr}\n\n` +
    `_Log in to Business Market Monitor for real-time market impact analysis._`
  );
}

/**
 * Format human-readable WhatsApp news & procurement digest text.
 */
function formatNewsDigestMessage({
  businessName,
  industryName,
  frequency = 'WEEKLY',
  topMovers = [],
  topNews = [],
  procurementActions = [],
  generatedAt = null,
}) {
  const safeBusiness = businessName || 'Your Business';
  const safeIndustry = industryName || 'Industry';
  const freqLabel = String(frequency).toUpperCase() === 'DAILY' ? 'Daily' : (String(frequency).toUpperCase() === 'MONTHLY' ? 'Monthly' : 'Weekly');
  const dt = generatedAt ? new Date(generatedAt) : new Date();
  const dateStr = dt.toISOString().slice(0, 10);

  const lines = [
    `📰 *Business Market Monitor — ${freqLabel} Digest*`,
    `🏢 *${safeBusiness}* (${safeIndustry}) | ${dateStr}`,
    '',
    `📊 *7-Day Price Movers:*`,
  ];

  if (topMovers && topMovers.length > 0) {
    topMovers.slice(0, 5).forEach((m) => {
      const sign = Number(m.changePercent) > 0 ? '+' : '';
      const unit = m.unit ? `/${m.unit}` : '';
      lines.push(`• *${m.materialName}*: ${m.currency || 'INR'} ${Number(m.latestPrice || 0).toFixed(2)}${unit} (${sign}${Number(m.changePercent || 0).toFixed(1)}%) [${m.trend || 'STABLE'}]`);
    });
  } else {
    lines.push(`• All tracked materials stable.`);
  }

  lines.push('', `🎯 *Sourcing Actions:*`);
  if (procurementActions && procurementActions.length > 0) {
    procurementActions.slice(0, 3).forEach((a) => {
      const action = String(a.actionRecommendation || a.action || 'MONITOR_ONLY').replace(/_/g, ' ');
      lines.push(`• *${a.materialName}*: ${action} — ${a.rationale || a.bufferStrategy?.summary || 'Standard replenishment buffer.'}`);
    });
  } else {
    lines.push(`• Standard inventory replenishment buffers maintained.`);
  }

  if (topNews && topNews.length > 0) {
    lines.push('', `🗞️ *Industry Headlines:*`);
    topNews.slice(0, 3).forEach((n) => {
      lines.push(`• *${n.title}* (${n.sourceName || 'News'})`);
    });
  }

  lines.push('', `_Open BMM dashboard for live trends, graphs & supplier benchmarks._`);

  return lines.join('\n');
}

/**
 * Send a message via Meta WhatsApp Cloud API.
 *
 * @param {Object} options
 * @param {string} options.to E.164 phone number (e.g. "+919876543210")
 * @param {string} options.text Formatted text body
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendMessage({ to, text }) {
  if (!env.whatsapp || !env.whatsapp.enabled) {
    return {
      success: false,
      error: 'WhatsApp delivery is disabled (WHATSAPP_ENABLED=false)',
    };
  }

  if (!isValidE164(to)) {
    return {
      success: false,
      error: `Invalid destination phone number (${redactPhoneNumber(to)}). Must be valid E.164 format.`,
    };
  }

  const apiToken = env.whatsapp.apiToken;
  const phoneNumberId = env.whatsapp.phoneNumberId;
  const baseUrl = env.whatsapp.baseUrl || 'https://graph.facebook.com/v20.0';
  const timeoutMs = env.whatsapp.timeoutMs || 15000;

  if (!apiToken || !phoneNumberId) {
    return {
      success: false,
      error: 'WhatsApp provider misconfigured (missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID)',
    };
  }

  // Meta Cloud API expects recipient number without leading '+'
  const recipientDigits = String(to).trim().replace(/^\+/, '');
  const url = `${baseUrl.replace(/\/+$/, '')}/${phoneNumberId}/messages`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientDigits,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const apiErr = data && data.error && data.error.message
        ? data.error.message
        : `HTTP ${response.status} ${response.statusText}`;
      return {
        success: false,
        error: sanitizeErrorMessage(new Error(apiErr)),
      };
    }

    const messageId = data?.messages?.[0]?.id || 'delivered';
    return {
      success: true,
      messageId,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: `WhatsApp request timed out after ${timeoutMs}ms`,
      };
    }
    return {
      success: false,
      error: sanitizeErrorMessage(err),
    };
  }
}

module.exports = {
  isValidE164,
  redactPhoneNumber,
  sanitizeErrorMessage,
  formatAlertMessage,
  formatNewsDigestMessage,
  sendMessage,
};
